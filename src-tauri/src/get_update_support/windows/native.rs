//! Read-only Win32 collector. Deliberately excluded from test builds: tests
//! exercise the policy/provider boundary, never host registry/processes/ACLs.
use super::*;
use std::{
    mem::{size_of, zeroed},
    ptr::{null, null_mut},
};
use windows_sys::Win32::{
    Foundation::*,
    Globalization::lstrcmpiW,
    Security::{Authorization::*, *},
    Storage::FileSystem::*,
    System::{
        ApplicationInstallationAndServicing::MsiEnumRelatedProductsW, Com::CoTaskMemFree,
        Diagnostics::ToolHelp::*, LibraryLoader::GetModuleFileNameW, Registry::*,
        RestartManager::*, Threading::*, WindowsProgramming::DRIVE_FIXED,
    },
    UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath},
};

pub(in crate::get_update_support) struct Native;
struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe {
            RegCloseKey(self.0);
        }
    }
}
struct LocalAllocation(*mut core::ffi::c_void);
impl Drop for LocalAllocation {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}
struct Session(u32);
impl Session {
    fn finish(self) -> EvidenceResult<()> {
        let status = unsafe { RmEndSession(self.0) };
        if status == ERROR_SUCCESS {
            std::mem::forget(self);
            Ok(())
        } else {
            Err(())
        }
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        unsafe {
            RmEndSession(self.0);
        }
    }
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
fn text(buffer: &[u16]) -> EvidenceResult<String> {
    let end = buffer.iter().position(|c| *c == 0).ok_or(())?;
    String::from_utf16(&buffer[..end]).map_err(|_| ())
}
fn handle(value: HANDLE) -> EvidenceResult<Handle> {
    if value.is_null() || value == INVALID_HANDLE_VALUE {
        Err(())
    } else {
        Ok(Handle(value))
    }
}

fn open_key(scope: Scope, path: &str) -> EvidenceResult<Option<Key>> {
    unsafe {
        let mut user = null_mut();
        let root = match scope {
            Scope::User64 | Scope::User32 => {
                if RegOpenCurrentUser(KEY_READ, &mut user) != ERROR_SUCCESS {
                    return Err(());
                }
                user
            }
            _ => HKEY_LOCAL_MACHINE,
        };
        let user_guard = if user.is_null() {
            None
        } else {
            Some(Key(user))
        };
        let view = match scope {
            Scope::User64 | Scope::Machine64 => KEY_WOW64_64KEY,
            _ => KEY_WOW64_32KEY,
        };
        let mut key = null_mut();
        let status = RegOpenKeyExW(root, wide(path).as_ptr(), 0, KEY_READ | view, &mut key);
        drop(user_guard);
        match status {
            ERROR_SUCCESS => Ok(Some(Key(key))),
            ERROR_FILE_NOT_FOUND => Ok(None),
            _ => Err(()),
        }
    }
}

fn value(key: &Key, name: &str) -> EvidenceResult<Option<String>> {
    // Single bounded read. MORE_DATA, wrong type, interior NUL or nonterminated
    // data is unknown, never silently truncated or expanded as a path.
    unsafe {
        let mut buffer = [0u16; 512];
        let mut bytes = size_of::<[u16; 512]>() as u32;
        let mut kind = 0;
        let status = RegQueryValueExW(
            key.0,
            wide(name).as_ptr(),
            null(),
            &mut kind,
            buffer.as_mut_ptr().cast(),
            &mut bytes,
        );
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS
            || kind != REG_SZ
            || bytes < 2
            || bytes % 2 != 0
            || bytes as usize > size_of::<[u16; 512]>()
        {
            return Err(());
        }
        let used = &buffer[..bytes as usize / 2];
        if used.last() != Some(&0) || used[..used.len() - 1].contains(&0) {
            return Err(());
        }
        Ok(Some(
            String::from_utf16(&used[..used.len() - 1]).map_err(|_| ())?,
        ))
    }
}

impl EvidenceProvider for Native {
    fn local_app_data(&mut self) -> EvidenceResult<String> {
        unsafe {
            // Reject elevated/impersonated contexts; current-user NSIS starts
            // with RequestExecutionLevel user, not arbitrary effective rights.
            let token = effective_token()?;
            let mut result = null_mut();
            if SHGetKnownFolderPath(&FOLDERID_LocalAppData, 0, token.0, &mut result) < 0
                || result.is_null()
            {
                return Err(());
            }
            let mut length = 0;
            while length < 260 && *result.add(length) != 0 {
                length += 1;
            }
            let decoded = if length == 260 {
                Err(())
            } else {
                String::from_utf16(std::slice::from_raw_parts(result, length)).map_err(|_| ())
            };
            CoTaskMemFree(result.cast());
            decoded
        }
    }
    fn registration(&mut self, scope: Scope, path: &str) -> EvidenceResult<Option<Values>> {
        let Some(key) = open_key(scope, path)? else {
            return Ok(None);
        };
        let mut values = Values::new();
        let names: &[&str] = match path {
            PRODUCT_KEY => &["", "InstallDir"],
            ARP_KEY => &[
                "InstallDir",
                "DisplayName",
                "Publisher",
                "DisplayVersion",
                "MainBinaryName",
                "InstallLocation",
                "UninstallString",
            ],
            _ => return Err(()),
        };
        for &name in names {
            if let Some(v) = value(&key, name)? {
                values.insert(name.into(), v);
            }
        }
        Ok(Some(values))
    }
    fn machine_arp_collision(&mut self) -> EvidenceResult<bool> {
        let root = open_key(Scope::Machine64, ARP_ROOT)?.ok_or(())?;
        for index in 0..1024 {
            let mut buffer = [0u16; 256];
            let mut length = buffer.len() as u32;
            let status = unsafe {
                RegEnumKeyExW(
                    root.0,
                    index,
                    buffer.as_mut_ptr(),
                    &mut length,
                    null(),
                    null_mut(),
                    null_mut(),
                    null_mut(),
                )
            };
            if status == ERROR_NO_MORE_ITEMS {
                return Ok(false);
            }
            if status != ERROR_SUCCESS || length == 0 || length as usize >= buffer.len() {
                return Err(());
            }
            let name = String::from_utf16(&buffer[..length as usize]).map_err(|_| ())?;
            let key = open_key(Scope::Machine64, &format!("{ARP_ROOT}\\{name}"))?.ok_or(())?;
            let display = value(&key, "DisplayName")?.unwrap_or_default();
            let publisher = value(&key, "Publisher")?.unwrap_or_default();
            // NSIS StrCmp is case-insensitive, and the current template
            // concatenates these fields before comparing. Use native Unicode
            // comparison rather than silently narrowing it to ASCII equality.
            if unsafe {
                lstrcmpiW(
                    wide(&format!("{display}{publisher}")).as_ptr(),
                    wide(&format!("{PRODUCT}{PUBLISHER}")).as_ptr(),
                )
            } == 0
            {
                return Ok(true);
            }
        }
        Err(()) // incomplete scan, even if no collision was seen
    }
    fn related_msi(&mut self, upgrade_code: &str) -> EvidenceResult<bool> {
        let mut code = [0u16; 39];
        match unsafe {
            MsiEnumRelatedProductsW(wide(upgrade_code).as_ptr(), 0, 0, code.as_mut_ptr())
        } {
            ERROR_NO_MORE_ITEMS => Ok(false),
            ERROR_SUCCESS => Ok(true), // existence alone denies; no uninstaller call
            _ => Err(()),
        }
    }
    fn replacement_object(&mut self, path: &str, kind: ObjectKind) -> EvidenceResult<FileId> {
        inspect_object(path, kind, true)
    }
    fn running_image(&mut self) -> EvidenceResult<(String, FileId)> {
        let mut buffer = [0u16; 260];
        let length =
            unsafe { GetModuleFileNameW(null_mut(), buffer.as_mut_ptr(), buffer.len() as u32) };
        if length == 0 || length as usize >= buffer.len() {
            return Err(());
        }
        let path = String::from_utf16(&buffer[..length as usize]).map_err(|_| ())?;
        let id = inspect_object(&path, ObjectKind::File, false)?;
        Ok((path, id))
    }
    fn exclusive_process_scope(&mut self, executable: &str) -> EvidenceResult<()> {
        unsafe {
            let current = GetCurrentProcessId();
            let snapshot = handle(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0))?;
            let mut entry: PROCESSENTRY32W = zeroed();
            entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
            if Process32FirstW(snapshot.0, &mut entry) == 0 {
                return Err(());
            }
            let mut seen_self = false;
            let mut complete = false;
            for _ in 0..65536 {
                let name = text(&entry.szExeFile)?;
                if entry.th32ProcessID == current {
                    if !name.eq_ignore_ascii_case(BINARY) {
                        return Err(());
                    }
                    seen_self = true;
                } else if name.eq_ignore_ascii_case(BINARY)
                    || name.eq_ignore_ascii_case("uninstall.exe")
                    || name.eq_ignore_ascii_case("Wallpaper Picker UI.exe")
                {
                    return Err(());
                }
                if Process32NextW(snapshot.0, &mut entry) == 0 {
                    if GetLastError() != ERROR_NO_MORE_FILES {
                        return Err(());
                    }
                    complete = true;
                    break;
                }
            }
            if !seen_self || !complete {
                return Err(());
            }
            let mut session = 0;
            let mut key = [0u16; 33];
            if RmStartSession(&mut session, 0, key.as_mut_ptr()) != ERROR_SUCCESS {
                return Err(());
            }
            let session = Session(session);
            let file = wide(executable);
            let file_ptr = file.as_ptr();
            if RmRegisterResources(session.0, 1, &file_ptr, 0, null(), 0, null()) != ERROR_SUCCESS {
                return Err(());
            }
            let mut needed = 0;
            let mut count = 0;
            let mut reasons = 0;
            let status = RmGetList(session.0, &mut needed, &mut count, null_mut(), &mut reasons);
            if status == ERROR_SUCCESS && needed == 0 {
                return session.finish();
            }
            if status != ERROR_MORE_DATA || needed == 0 || needed > 1024 {
                return Err(());
            }
            let mut list: Vec<RM_PROCESS_INFO> = vec![zeroed(); needed as usize];
            count = needed;
            if RmGetList(
                session.0,
                &mut needed,
                &mut count,
                list.as_mut_ptr(),
                &mut reasons,
            ) != ERROR_SUCCESS
                || count as usize > list.len()
            {
                return Err(());
            }
            let mut creation = zeroed();
            let mut exit = zeroed();
            let mut kernel = zeroed();
            let mut user = zeroed();
            if GetProcessTimes(
                GetCurrentProcess(),
                &mut creation,
                &mut exit,
                &mut kernel,
                &mut user,
            ) == 0
            {
                return Err(());
            }
            for item in &list[..count as usize] {
                if item.Process.dwProcessId != current
                    || item.Process.ProcessStartTime.dwLowDateTime != creation.dwLowDateTime
                    || item.Process.ProcessStartTime.dwHighDateTime != creation.dwHighDateTime
                {
                    return Err(());
                }
            }
            // EndSession failure is unknown. No RmShutdown/kill/close messages.
            session.finish()
        }
    }
}

fn effective_token() -> EvidenceResult<Handle> {
    unsafe {
        let mut thread = null_mut();
        if OpenThreadToken(
            GetCurrentThread(),
            TOKEN_QUERY | TOKEN_DUPLICATE,
            1,
            &mut thread,
        ) != 0
        {
            // No support while impersonating: HKCU/known-folder/installer identity
            // would otherwise depend on which thread performed the check.
            drop(handle(thread)?);
            return Err(());
        }
        if GetLastError() != ERROR_NO_TOKEN {
            return Err(());
        }
        let mut token = null_mut();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_QUERY | TOKEN_DUPLICATE | TOKEN_IMPERSONATE,
            &mut token,
        ) == 0
        {
            return Err(());
        }
        let token = handle(token)?;
        let mut elevation: TOKEN_ELEVATION = zeroed();
        let mut bytes = 0;
        if GetTokenInformation(
            token.0,
            TokenElevation,
            (&mut elevation as *mut TOKEN_ELEVATION).cast(),
            size_of::<TOKEN_ELEVATION>() as u32,
            &mut bytes,
        ) == 0
            || elevation.TokenIsElevated != 0
        {
            return Err(());
        }
        Ok(token)
    }
}

fn access(object: &Handle, rights: u32, require_owner: bool) -> EvidenceResult<()> {
    unsafe {
        let token = effective_token()?;
        let mut impersonation = null_mut();
        if DuplicateToken(token.0, SecurityImpersonation, &mut impersonation) == 0 {
            return Err(());
        }
        let impersonation = handle(impersonation)?;
        let mut descriptor = null_mut();
        let mut owner = null_mut();
        let status = GetSecurityInfo(
            object.0,
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut owner,
            null_mut(),
            null_mut(),
            null_mut(),
            &mut descriptor,
        );
        if status != ERROR_SUCCESS || descriptor.is_null() {
            return Err(());
        }
        let _allocated = LocalAllocation(descriptor);
        if require_owner {
            // Aligned token-user buffer, bounded before reading the SID pointer.
            let mut info = [0usize; 128];
            let mut length = 0;
            if GetTokenInformation(
                token.0,
                TokenUser,
                info.as_mut_ptr().cast(),
                size_of_val(&info) as u32,
                &mut length,
            ) == 0
                || length as usize > size_of_val(&info)
                || length < size_of::<TOKEN_USER>() as u32
                || owner.is_null()
            {
                return Err(());
            }
            let user = &*(info.as_ptr().cast::<TOKEN_USER>());
            if EqualSid(owner, user.User.Sid) == 0 {
                return Err(());
            }
        }
        let mapping = GENERIC_MAPPING {
            GenericRead: FILE_GENERIC_READ,
            GenericWrite: FILE_GENERIC_WRITE,
            GenericExecute: FILE_GENERIC_EXECUTE,
            GenericAll: FILE_ALL_ACCESS,
        };
        let mut privileges = [0usize; 128];
        let mut length = size_of_val(&privileges) as u32;
        let mut granted = 0;
        let mut allowed = 0;
        if AccessCheck(
            descriptor,
            impersonation.0,
            rights,
            &mapping,
            privileges.as_mut_ptr().cast(),
            &mut length,
            &mut granted,
            &mut allowed,
        ) == 0
            || allowed == 0
            || granted & rights != rights
        {
            return Err(());
        }
        Ok(())
    }
}

fn inspect_object(path: &str, kind: ObjectKind, replacement: bool) -> EvidenceResult<FileId> {
    if !strict_local_path(path) {
        return Err(());
    }
    unsafe {
        if GetDriveTypeW(wide(&path[..3]).as_ptr()) != DRIVE_FIXED {
            return Err(());
        }
        // Inspect literal ancestors before the final object. Never canonicalize
        // first and accidentally redefine an allowed boundary through a junction.
        let mut prefixes = vec![&path[..3]];
        for (index, ch) in path.char_indices().skip(3) {
            if ch == '\\' {
                prefixes.push(&path[..index]);
            }
        }
        prefixes.push(path);
        let mut result = None;
        for (index, prefix) in prefixes.iter().enumerate() {
            let final_object = index == prefixes.len() - 1;
            let object = handle(CreateFileW(
                wide(prefix).as_ptr(),
                FILE_READ_ATTRIBUTES | READ_CONTROL,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
                null_mut(),
            ))?;
            let mut info: BY_HANDLE_FILE_INFORMATION = zeroed();
            if GetFileInformationByHandle(object.0, &mut info) == 0
                || info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
            {
                return Err(());
            }
            let is_directory = info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0;
            if (!final_object || kind == ObjectKind::Directory) != is_directory {
                return Err(());
            }
            let mut final_path = [0u16; 260];
            let length = GetFinalPathNameByHandleW(
                object.0,
                final_path.as_mut_ptr(),
                final_path.len() as u32,
                0,
            );
            if length == 0 || length as usize >= final_path.len() {
                return Err(());
            }
            let resolved = String::from_utf16(&final_path[..length as usize]).map_err(|_| ())?;
            if resolved.strip_prefix(r"\\?\").unwrap_or(&resolved) != *prefix {
                return Err(());
            }
            if !final_object {
                access(&object, FILE_TRAVERSE, false)?;
                continue;
            }
            if !is_directory && info.nNumberOfLinks != 1 {
                return Err(());
            }
            if replacement {
                if info.dwFileAttributes & FILE_ATTRIBUTE_READONLY != 0 {
                    return Err(());
                }
                let rights = if is_directory {
                    FILE_ADD_FILE
                        | FILE_ADD_SUBDIRECTORY
                        | FILE_DELETE_CHILD
                        | FILE_TRAVERSE
                        | FILE_WRITE_ATTRIBUTES
                } else {
                    FILE_WRITE_DATA | FILE_APPEND_DATA | FILE_WRITE_ATTRIBUTES | DELETE
                };
                access(&object, rights, true)?;
            }
            result = Some(FileId(
                info.dwVolumeSerialNumber,
                ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
            ));
        }
        result.ok_or(())
    }
}

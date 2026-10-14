//! Read-only release metadata; never updater resources or installation authority.

const LATEST_METADATA_URL: &str =
    "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/latest/download/latest.json";

#[tauri::command]
pub async fn check_release_notice() -> Result<Option<ReleaseNotice>, String> {
    // No native update policy, filesystem or host inspection. Only packaged Linux
    // production may perform this public metadata request; tests inject readers.
    if !cfg!(all(target_os = "linux", not(debug_assertions), not(test))) {
        return Ok(None);
    }
    fetch_notice_with(env!("CARGO_PKG_VERSION"), |request| async move {
        // reqwest is already locked without its own provider. Match the existing
        // ring backend without invoking or constructing any updater resource.
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
        let client = reqwest::Client::builder()
            .https_only(true)
            .no_proxy()
            .referer(false)
            .retry(reqwest::retry::never())
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if redirect_allowed(attempt.url(), attempt.previous().len()) {
                    attempt.follow()
                } else {
                    attempt.error("Release check failed.")
                }
            }))
            .build()
            .map_err(|_| "Release check failed.".to_owned())?;
        let response = client
            .execute(request)
            .await
            .map_err(|_| "Release check failed.".to_owned())?;
        Ok((
            response.status().as_u16(),
            response.content_length(),
            response,
        ))
    })
    .await
}

async fn fetch_notice_with<R, F>(
    current_version: &str,
    send: impl FnOnce(reqwest::Request) -> F,
) -> Result<Option<ReleaseNotice>, String>
where
    R: BodyReader,
    F: std::future::Future<Output = Result<(u16, Option<u64>, R), String>>,
{
    checked_version(current_version)?;
    let (status, declared_length, mut reader) = send(metadata_request()?)
        .await
        .map_err(|_| "Release check failed.".to_owned())?;
    let bytes = read_bounded_body(status, declared_length, &mut reader).await?;
    parse_notice(&bytes, current_version)
}

fn metadata_request() -> Result<reqwest::Request, String> {
    let url =
        reqwest::Url::parse(LATEST_METADATA_URL).map_err(|_| "Release check failed.".to_owned())?;
    if !safe_metadata_url(&url) {
        return Err("Release check failed.".to_owned());
    }
    let mut request = reqwest::Request::new(reqwest::Method::GET, url);
    *request.timeout_mut() = Some(std::time::Duration::from_secs(15));
    request.headers_mut().insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    Ok(request)
}

fn safe_metadata_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}

fn redirect_allowed(url: &reqwest::Url, redirect_count: usize) -> bool {
    redirect_count <= 3 && safe_metadata_url(url)
}

trait BodyReader {
    async fn next_chunk(&mut self) -> Result<Option<impl AsRef<[u8]>>, String>;
}

impl BodyReader for reqwest::Response {
    async fn next_chunk(&mut self) -> Result<Option<impl AsRef<[u8]>>, String> {
        self.chunk()
            .await
            .map_err(|_| "Release check failed.".to_owned())
    }
}

const MAX_METADATA_BYTES: usize = 128 * 1024;

async fn read_bounded_body(
    status: u16,
    declared_length: Option<u64>,
    reader: &mut impl BodyReader,
) -> Result<Vec<u8>, String> {
    if status != 200 || declared_length.is_some_and(|length| length > MAX_METADATA_BYTES as u64) {
        return Err("Release check failed.".to_owned());
    }
    // Reserve once: Vec's geometric growth must not exceed the metadata budget.
    let mut bytes = Vec::with_capacity(MAX_METADATA_BYTES);
    while let Some(chunk) = reader
        .next_chunk()
        .await
        .map_err(|_| "Release check failed.".to_owned())?
    {
        let chunk = chunk.as_ref();
        if chunk.len() > MAX_METADATA_BYTES - bytes.len() {
            return Err("Release check failed.".to_owned());
        }
        bytes.extend_from_slice(chunk);
    }
    Ok(bytes)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotice {
    current_version: String,
    version: String,
    body: Option<String>,
    date: Option<String>,
}

#[derive(serde::Deserialize)]
struct Metadata {
    version: String,
    notes: Option<String>,
    pub_date: Option<String>,
}

fn checked_version(value: &str) -> Result<semver::Version, String> {
    if value.len() > 128 {
        return Err("Release metadata is invalid.".to_owned());
    }
    semver::Version::parse(value).map_err(|_| "Release metadata is invalid.".to_owned())
}

fn parse_notice(bytes: &[u8], current_version: &str) -> Result<Option<ReleaseNotice>, String> {
    if bytes.len() > MAX_METADATA_BYTES {
        return Err("Release metadata is invalid.".to_owned());
    }
    let current = checked_version(current_version)?;
    let metadata: Metadata =
        serde_json::from_slice(bytes).map_err(|_| "Release metadata is invalid.".to_owned())?;
    if metadata
        .notes
        .as_ref()
        .is_some_and(|notes| notes.len() > 64 * 1024)
        || metadata.pub_date.as_ref().is_some_and(|date| {
            date.len() > 64 || chrono::DateTime::parse_from_rfc3339(date).is_err()
        })
    {
        return Err("Release metadata is invalid.".to_owned());
    }
    let candidate = checked_version(&metadata.version)?;
    if !candidate.pre.is_empty() || !candidate.cmp_precedence(&current).is_gt() {
        return Ok(None);
    }
    Ok(Some(ReleaseNotice {
        current_version: current_version.to_owned(),
        version: metadata.version,
        body: metadata.notes,
        date: metadata.pub_date,
    }))
}

#[cfg(test)]
mod tests;

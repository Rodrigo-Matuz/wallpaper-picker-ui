use super::*;
use std::future::Future;
use std::task::{Context, Poll, Waker};

fn ready<T>(future: impl Future<Output = T>) -> T {
    let mut future = std::pin::pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("pure fixture must not wait on network or runtime"),
    }
}

struct FixtureBody {
    chunks: std::collections::VecDeque<Result<Vec<u8>, String>>,
    reads: usize,
}

impl FixtureBody {
    fn new(chunks: impl IntoIterator<Item = Vec<u8>>) -> Self {
        Self {
            chunks: chunks.into_iter().map(Ok).collect(),
            reads: 0,
        }
    }
}

impl BodyReader for FixtureBody {
    async fn next_chunk(&mut self) -> Result<Option<impl AsRef<[u8]>>, String> {
        self.reads += 1;
        self.chunks.pop_front().transpose()
    }
}

#[test]
fn response_accumulator_allocation_stays_within_byte_budget() {
    let mut reader = FixtureBody::new([vec![b' '; 70_000], vec![b' '; 50_000]]);
    let bytes = ready(read_bounded_body(200, None, &mut reader)).unwrap();
    assert_eq!(bytes.len(), 120_000);
    assert!(bytes.capacity() <= 128 * 1024);
}

#[test]
fn metadata_and_version_budgets_fail_closed() {
    let oversized = format!("3.7.0+{}", "a".repeat(123));
    let bytes = serde_json::to_vec(&serde_json::json!({"version": oversized})).unwrap();
    assert!(parse_notice(&bytes, "3.6.9").is_err());
    assert!(parse_notice(
        br#"{"version":"3.7.0"}"#,
        &format!("3.6.9+{}", "a".repeat(123))
    )
    .is_err());
    let mut padded = br#"{"version":"3.7.0"}"#.to_vec();
    padded.resize(128 * 1024 + 1, b' ');
    assert!(parse_notice(&padded, "3.6.9").is_err());
    let mut sends = 0;
    assert!(ready(fetch_notice_with(
        &format!("3.6.9+{}", "a".repeat(123)),
        |_| {
            sends += 1;
            std::future::ready(Ok((
                200,
                None,
                FixtureBody::new([br#"{"version":"3.7.0"}"#.to_vec()]),
            )))
        }
    ))
    .is_err());
    assert_eq!(sends, 0);
}

#[test]
fn command_is_inert_on_test_hosts() {
    assert!(ready(check_release_notice()).unwrap().is_none());
}

#[test]
fn transport_errors_are_redacted() {
    let result = ready(fetch_notice_with::<FixtureBody, _>("3.6.9", |_| {
        std::future::ready(Err(
            "https://github.com/secret?token=private: server rejected".to_owned(),
        ))
    }));
    assert_eq!(result.unwrap_err(), "Release check failed.");
}

#[test]
fn invalid_current_version_never_sends_a_request() {
    let mut sends = 0;
    let result = ready(fetch_notice_with("v3.6.9", |_| {
        sends += 1;
        std::future::ready(Ok((
            200,
            None,
            FixtureBody::new([br#"{"version":"3.7.0"}"#.to_vec()]),
        )))
    }));
    assert!(result.is_err());
    assert_eq!(sends, 0);
}

#[test]
fn injected_transport_returns_only_newer_stable_notice() {
    let mut sends = 0;
    let notice = ready(fetch_notice_with("3.6.9", |request| {
        sends += 1;
        assert_eq!(request.url().as_str(), LATEST_METADATA_URL);
        std::future::ready(Ok((
            200,
            None,
            FixtureBody::new([br#"{"version":"3.7.0"}"#.to_vec()]),
        )))
    }))
    .unwrap()
    .unwrap();
    assert_eq!(sends, 1);
    assert_eq!(notice.current_version, "3.6.9");
    assert_eq!(notice.version, "3.7.0");
}

#[test]
fn metadata_request_is_fixed_public_get_with_whole_request_timeout() {
    let request = metadata_request().unwrap();
    assert_eq!(request.method(), reqwest::Method::GET);
    assert_eq!(request.url().as_str(), LATEST_METADATA_URL);
    assert_eq!(request.timeout(), Some(&std::time::Duration::from_secs(15)));
    assert!(request.body().is_none());
    assert_eq!(
        request.headers().get(reqwest::header::ACCEPT).unwrap(),
        "application/json"
    );
    for header in [
        reqwest::header::AUTHORIZATION,
        reqwest::header::PROXY_AUTHORIZATION,
        reqwest::header::COOKIE,
        reqwest::header::REFERER,
    ] {
        assert!(!request.headers().contains_key(header));
    }
}

#[test]
fn reader_errors_are_redacted_and_stop_consumption() {
    let mut reader = FixtureBody {
        chunks: [
            Ok(b"{\"version\":".to_vec()),
            Err(
                "https://release-assets.githubusercontent.com/secret?token=private server failure"
                    .to_owned(),
            ),
            Ok(b"never-read".to_vec()),
        ]
        .into_iter()
        .collect(),
        reads: 0,
    };
    assert_eq!(
        ready(read_bounded_body(200, None, &mut reader)).unwrap_err(),
        "Release check failed."
    );
    assert_eq!(reader.reads, 2);
    assert_eq!(reader.chunks.len(), 1);
}

#[test]
fn actual_body_limit_wins_over_missing_or_lying_content_length() {
    for declared in [None, Some(0), Some(1), Some(128 * 1024)] {
        let mut reader = FixtureBody::new([
            vec![b' '; 128 * 1024],
            vec![b'x'],
            b"must not read".to_vec(),
        ]);
        assert!(ready(read_bounded_body(200, declared, &mut reader)).is_err());
        assert_eq!(reader.reads, 2);
        assert_eq!(reader.chunks.len(), 1);
    }
    let mut one_huge_chunk = FixtureBody::new([vec![0; 128 * 1024 + 1], vec![0]]);
    assert!(ready(read_bounded_body(200, None, &mut one_huge_chunk)).is_err());
    assert_eq!(one_huge_chunk.reads, 1);
    let mut exact = FixtureBody::new([vec![b' '; 64 * 1024], vec![b' '; 64 * 1024]]);
    assert_eq!(
        ready(read_bounded_body(200, Some(128 * 1024), &mut exact))
            .unwrap()
            .len(),
        128 * 1024
    );
}

#[test]
fn rejected_status_or_declared_overflow_never_reads_a_response_body() {
    for (status, declared) in [
        (199, None),
        (201, None),
        (204, None),
        (206, None),
        (301, None),
        (304, None),
        (403, None),
        (404, None),
        (429, None),
        (500, None),
        (200, Some(128 * 1024 + 1)),
        (200, Some(u64::MAX)),
    ] {
        let mut reader = FixtureBody::new([b"secret server error".to_vec()]);
        assert!(ready(read_bounded_body(status, declared, &mut reader)).is_err());
        assert_eq!(reader.reads, 0, "status {status}, declared {declared:?}");
    }
}

#[test]
fn streamed_feed_metadata_is_read_and_parsed_without_payloads() {
    let mut reader = FixtureBody::new([
        br#"{"version":"3.7.0","notes":"safe "#.to_vec(),
        br#"notes","platforms":null}"#.to_vec(),
    ]);
    let bytes = ready(read_bounded_body(200, None, &mut reader)).unwrap();
    let notice = parse_notice(&bytes, "3.6.9").unwrap().unwrap();
    assert_eq!(notice.version, "3.7.0");
    assert_eq!(notice.body.as_deref(), Some("safe notes"));
    assert_eq!(reader.reads, 3);
}

#[test]
fn feed_and_redirects_use_only_credential_free_allowlisted_https() {
    assert_eq!(
        LATEST_METADATA_URL,
        "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/latest/download/latest.json"
    );
    for url in [
        LATEST_METADATA_URL,
        "https://release-assets.githubusercontent.com/asset?public-signed-query=opaque",
        "https://objects.githubusercontent.com/asset",
        "https://github.com:443/release",
    ] {
        assert!(
            safe_metadata_url(&reqwest::Url::parse(url).unwrap()),
            "{url}"
        );
    }
    for url in [
        "http://github.com/release",
        "https://github.com:444/release",
        "https://github.com.evil.test/release",
        "https://evil.test/github.com",
        "https://raw.githubusercontent.com/release",
        "https://api.github.com/release",
        "https://user@github.com/release",
        "https://user:secret@github.com/release",
        "https://github.com./release",
        "https://127.0.0.1/release",
        "https://[::1]/release",
        "https://github.com/release#fragment",
        "file:///latest.json",
    ] {
        assert!(
            !safe_metadata_url(&reqwest::Url::parse(url).unwrap()),
            "{url}"
        );
    }
    let target = reqwest::Url::parse(LATEST_METADATA_URL).unwrap();
    for count in 1..=3 {
        assert!(redirect_allowed(&target, count));
    }
    assert!(!redirect_allowed(&target, 4));
    assert!(!redirect_allowed(
        &reqwest::Url::parse("http://github.com/release").unwrap(),
        1
    ));
}

#[test]
fn metadata_text_is_typed_bounded_and_date_is_rfc3339() {
    for optional in [
        serde_json::json!({}),
        serde_json::json!({"notes": null, "pub_date": null}),
    ] {
        let mut value = serde_json::json!({"version": "3.7.0"});
        value
            .as_object_mut()
            .unwrap()
            .extend(optional.as_object().unwrap().clone());
        let notice = parse_notice(&serde_json::to_vec(&value).unwrap(), "3.6.9")
            .unwrap()
            .unwrap();
        assert!(notice.body.is_none());
        assert!(notice.date.is_none());
    }
    for (field, value) in [
        ("notes", serde_json::json!("n".repeat(64 * 1024 + 1))),
        ("notes", serde_json::json!("é".repeat(32 * 1024 + 1))),
        ("notes", serde_json::json!(false)),
        ("notes", serde_json::json!([])),
        ("pub_date", serde_json::json!("2026-02-30T12:00:00Z")),
        ("pub_date", serde_json::json!("not-a-date")),
        ("pub_date", serde_json::json!("2026-10-14")),
        ("pub_date", serde_json::json!("x".repeat(65))),
        ("pub_date", serde_json::json!(42)),
        ("version", serde_json::json!(null)),
        ("version", serde_json::json!(42)),
    ] {
        let mut metadata = serde_json::json!({"version": "3.7.0"});
        metadata[field] = value;
        assert!(
            parse_notice(&serde_json::to_vec(&metadata).unwrap(), "3.6.9").is_err(),
            "{field}"
        );
    }
    let bytes = serde_json::to_vec(&serde_json::json!({"version": "3.7.0", "notes": "n".repeat(64 * 1024), "pub_date": "2026-10-14T12:00:00.123+03:00"})).unwrap();
    assert_eq!(
        parse_notice(&bytes, "3.6.9")
            .unwrap()
            .unwrap()
            .body
            .unwrap()
            .len(),
        64 * 1024
    );
    for bytes in [
        b"not json".as_slice(),
        b"[]",
        b"{}",
        b"null",
        b"{\"version\":\"3.7.0\",\"notes\":\"\xff\"}",
    ] {
        assert!(parse_notice(bytes, "3.6.9").is_err());
    }
}

#[test]
fn version_admission_is_strict_stable_and_precedence_only() {
    for (upstream, current, expected) in [
        ("3.7.0", "3.6.9", Some(true)),
        ("3.6.9", "3.6.9", Some(false)),
        ("3.6.8", "3.6.9", Some(false)),
        ("3.7.0-rc.1", "3.6.9", Some(false)),
        ("3.6.9", "3.6.9-rc.1", Some(true)),
        ("3.6.9+build.2", "3.6.9+build.1", Some(false)),
        ("3.7.0+build.2", "3.6.9", Some(true)),
        ("v3.7.0", "3.6.9", None),
        (" 3.7.0", "3.6.9", None),
        ("3.7.0\n", "3.6.9", None),
        ("03.7.0", "3.6.9", None),
        ("3.07.0", "3.6.9", None),
        ("3.7.00", "3.6.9", None),
        ("3.7", "3.6.9", None),
        ("3.7.0.0", "3.6.9", None),
        ("3.7.0-01", "3.6.9", None),
        ("3.7.0", "v3.6.9", None),
        ("3.7.0", " 3.6.9 ", None),
        ("3.7.0", "garbage", None),
    ] {
        let bytes = serde_json::to_vec(&serde_json::json!({"version": upstream})).unwrap();
        let actual = parse_notice(&bytes, current);
        match expected {
            Some(present) => {
                assert_eq!(actual.unwrap().is_some(), present, "{upstream} / {current}")
            }
            None => assert!(actual.is_err(), "{upstream} / {current}"),
        }
    }
}

#[test]
fn newer_stable_metadata_has_only_notice_fields() {
    let notice = parse_notice(
        br#"{"version":"3.7.0","notes":"Release notes","pub_date":"2026-10-14T12:00:00Z","platforms":{"untrusted":{"url":"file:///never-read","signature":false}}}"#,
        "3.6.9",
    )
    .unwrap()
    .unwrap();
    assert_eq!(
        serde_json::to_value(notice).unwrap(),
        serde_json::json!({
            "currentVersion": "3.6.9",
            "version": "3.7.0",
            "body": "Release notes",
            "date": "2026-10-14T12:00:00Z"
        })
    );
}

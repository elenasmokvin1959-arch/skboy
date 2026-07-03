use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DATA_FILE: &str = "data.json";
const ADMIN_FILE: &str = "owner-panel.html";
const BLOCKED_PASSWORD: &str = "skboy228";
const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const MAX_REVIEW_TEXT: usize = 700;
const LOGIN_WINDOW: Duration = Duration::from_secs(15 * 60);
const REVIEW_WINDOW: Duration = Duration::from_secs(60 * 60);

fn main() -> std::io::Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "10000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;
    println!("skboy listening on port {port}");

    let mut security = SecurityState::default();
    for stream in listener.incoming().flatten() {
        handle_client(stream, &mut security);
    }

    Ok(())
}

#[derive(Default)]
struct SecurityState {
    login_failures: HashMap<String, Vec<SystemTime>>,
    review_posts: HashMap<String, Vec<SystemTime>>,
}

fn handle_client(mut stream: TcpStream, security: &mut SecurityState) {
    let Some(request) = read_request(&mut stream) else {
        send_json(&mut stream, "413 Payload Too Large", json!({"ok": false}));
        return;
    };

    let first_line = request.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
    let body = request.split("\r\n\r\n").nth(1).unwrap_or("");
    let ip = client_ip(&request, &stream);

    match (method, path.split('?').next().unwrap_or(path)) {
        ("POST", "/api/login") => {
            if is_limited(&mut security.login_failures, &ip, LOGIN_WINDOW, 8) {
                send_json(&mut stream, "429 Too Many Requests", json!({"ok": false}));
                return;
            }
            if check_admin_password(&request) {
                send_json(&mut stream, "200 OK", json!({"ok": true}));
            } else {
                remember_hit(&mut security.login_failures, &ip, LOGIN_WINDOW);
                send_json(&mut stream, "401 Unauthorized", json!({"ok": false}));
            }
        }
        ("GET", "/api/data") => send_json(&mut stream, "200 OK", public_data(load_data())),
        ("POST", "/api/data") => save_site_data(&mut stream, &request, body),
        ("POST", "/api/review") => {
            if is_limited(&mut security.review_posts, &ip, REVIEW_WINDOW, 6) {
                send_json(&mut stream, "429 Too Many Requests", json!({"ok": false}));
                return;
            }
            save_review(&mut stream, body, security, &ip);
        }
        _ => serve_file(&mut stream, path),
    }
}

fn read_request(stream: &mut TcpStream) -> Option<String> {
    let mut buffer = Vec::new();
    let mut temp = [0; 8192];
    let mut content_length = 0usize;

    loop {
        let size = stream.read(&mut temp).ok()?;
        if size == 0 {
            break;
        }
        buffer.extend_from_slice(&temp[..size]);
        if buffer.len() > MAX_REQUEST_BYTES {
            return None;
        }
        let text = String::from_utf8_lossy(&buffer);

        if let Some(header_end) = text.find("\r\n\r\n") {
            if content_length == 0 {
                content_length = parse_content_length(&text[..header_end]);
                if content_length > MAX_REQUEST_BYTES {
                    return None;
                }
            }
            if buffer.len() >= header_end + 4 + content_length {
                break;
            }
        }
    }

    String::from_utf8(buffer).ok()
}

fn parse_content_length(headers: &str) -> usize {
    headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse().ok())
                .flatten()
        })
        .unwrap_or(0)
}

fn save_site_data(stream: &mut TcpStream, request: &str, body: &str) {
    if !check_admin_password(request) {
        send_json(stream, "401 Unauthorized", json!({"ok": false, "error": "bad password"}));
        return;
    }

    match serde_json::from_str::<Value>(body) {
        Ok(mut value) => {
            if let Some(root) = value.as_object_mut() {
                root.remove("password");
            }
            match write_data(&value) {
            Ok(_) => send_json(stream, "200 OK", json!({"ok": true})),
            Err(_) => send_json(stream, "500 Internal Server Error", json!({"ok": false})),
            }
        }
        Err(_) => send_json(stream, "400 Bad Request", json!({"ok": false, "error": "bad json"})),
    }
}

fn save_review(stream: &mut TcpStream, body: &str, security: &mut SecurityState, ip: &str) {
    let Ok(review) = serde_json::from_str::<Value>(body) else {
        send_json(stream, "400 Bad Request", json!({"ok": false, "error": "bad json"}));
        return;
    };

    let Some(clean_review) = normalize_review(review) else {
        send_json(stream, "400 Bad Request", json!({"ok": false, "error": "bad review"}));
        return;
    };

    let mut data = load_data();
    if !data.is_object() {
        data = json!({});
    }

    let root = data.as_object_mut().unwrap();
    let reviews = root.entry("reviews").or_insert_with(|| json!([]));
    if !reviews.is_array() {
        *reviews = json!([]);
    }
    let list = reviews.as_array_mut().unwrap();
    list.insert(0, clean_review);
    if list.len() > 300 {
        list.truncate(300);
    }

    match write_data(&data) {
        Ok(_) => {
            remember_hit(&mut security.review_posts, ip, REVIEW_WINDOW);
            send_json(stream, "200 OK", json!({"ok": true}))
        }
        Err(_) => send_json(stream, "500 Internal Server Error", json!({"ok": false})),
    }
}

fn check_admin_password(request: &str) -> bool {
    let expected = env::var("ADMIN_PASSWORD").ok();
    let provided = request.lines().find_map(|line| {
        let Some((name, value)) = line.split_once(':') else {
            return None;
        };
        if name.eq_ignore_ascii_case("x-admin-password") {
            Some(value.trim().to_string())
        } else {
            None
        }
    });

    let Some(provided) = provided else {
        return false;
    };

    if provided == BLOCKED_PASSWORD {
        return false;
    }

    expected
        .filter(|value| !value.trim().is_empty() && value != BLOCKED_PASSWORD)
        .map(|value| provided == value)
        .unwrap_or(false)
}

fn load_data() -> Value {
    fs::read_to_string(DATA_FILE)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({}))
}

fn public_data(mut value: Value) -> Value {
    if let Some(root) = value.as_object_mut() {
        root.remove("password");
    }
    value
}

fn write_data(value: &Value) -> std::io::Result<()> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
    fs::write(DATA_FILE, bytes)
}

fn serve_file(stream: &mut TcpStream, path: &str) {
    let clean_path = clean_request_path(path);
    let admin_path = env::var("ADMIN_PATH")
        .ok()
        .map(|value| value.trim().trim_start_matches('/').to_string())
        .filter(|value| !value.is_empty() && !value.contains("..") && !value.contains('\\'));
    let is_admin = admin_path.as_deref() == Some(clean_path.as_str());
    let file_path = if is_admin {
        PathBuf::from(ADMIN_FILE)
    } else if clean_path == ADMIN_FILE {
        PathBuf::from("__not_found__")
    } else {
        resolve_path(path)
    };
    let (status, body, content_type) = match fs::read(&file_path) {
        Ok(body) => ("200 OK", body, content_type(&file_path)),
        Err(_) => ("404 Not Found", b"Not found".to_vec(), "text/plain; charset=utf-8"),
    };
    let cache = if is_admin || content_type.starts_with("text/html") {
        "no-store"
    } else {
        "public, max-age=300"
    };
    send_bytes(stream, status, body, content_type, cache);
}

fn send_json(stream: &mut TcpStream, status: &str, value: Value) {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    send_bytes(stream, status, body, "application/json; charset=utf-8", "no-store");
}

fn send_bytes(stream: &mut TcpStream, status: &str, body: Vec<u8>, content_type: &str, cache: &str) {
    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {content_type}\r\nCache-Control: {cache}\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'\r\nPermissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(&body);
}

fn resolve_path(raw_path: &str) -> PathBuf {
    let clean = clean_request_path(raw_path);
    if clean.is_empty() || clean.contains("..") || clean.contains('\\') {
        return PathBuf::from("index.html");
    }
    PathBuf::from(clean)
}

fn clean_request_path(raw_path: &str) -> String {
    raw_path
        .split('?')
        .next()
        .unwrap_or("/")
        .trim_start_matches('/')
        .to_string()
}

fn client_ip(request: &str, stream: &TcpStream) -> String {
    if let Some(value) = header_value(request, "x-forwarded-for") {
        if let Some(first) = value.split(',').next() {
            let clean = first.trim();
            if !clean.is_empty() {
                return clean.to_string();
            }
        }
    }
    stream
        .peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

fn header_value(request: &str, target: &str) -> Option<String> {
    request.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case(target)
            .then(|| value.trim().to_string())
    })
}

fn remember_hit(map: &mut HashMap<String, Vec<SystemTime>>, key: &str, window: Duration) {
    let now = SystemTime::now();
    let hits = map.entry(key.to_string()).or_default();
    hits.retain(|time| now.duration_since(*time).unwrap_or_default() <= window);
    hits.push(now);
}

fn is_limited(map: &mut HashMap<String, Vec<SystemTime>>, key: &str, window: Duration, limit: usize) -> bool {
    let now = SystemTime::now();
    let hits = map.entry(key.to_string()).or_default();
    hits.retain(|time| now.duration_since(*time).unwrap_or_default() <= window);
    hits.len() >= limit
}

fn normalize_review(value: Value) -> Option<Value> {
    let login = value.get("login")?.as_str()?.trim();
    let text = value.get("text")?.as_str()?.trim();
    if !valid_login(login) || text.len() < 5 || text.len() > MAX_REVIEW_TEXT {
        return None;
    }

    let rating = value
        .get("rating")
        .and_then(Value::as_i64)
        .unwrap_or(5)
        .clamp(1, 5);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    Some(json!({
        "id": format!("review-{now_ms}"),
        "login": login,
        "text": text,
        "createdAt": now_ms as u64,
        "approved": false,
        "rating": rating
    }))
}

fn valid_login(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 5 || bytes.len() > 33 || bytes.first() != Some(&b'@') {
        return false;
    }
    bytes[1..]
        .iter()
        .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

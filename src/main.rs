use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

const DATA_FILE: &str = "data.json";

fn main() -> std::io::Result<()> {
    let port = env::var("PORT").unwrap_or_else(|_| "10000".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))?;
    println!("skboy listening on port {port}");

    for stream in listener.incoming().flatten() {
        handle_client(stream);
    }

    Ok(())
}

fn handle_client(mut stream: TcpStream) {
    let Some(request) = read_request(&mut stream) else {
        return;
    };

    let first_line = request.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");
    let body = request.split("\r\n\r\n").nth(1).unwrap_or("");

    match (method, path.split('?').next().unwrap_or(path)) {
        ("GET", "/api/data") => send_json(&mut stream, "200 OK", load_data()),
        ("POST", "/api/data") => save_site_data(&mut stream, &request, body),
        ("POST", "/api/review") => save_review(&mut stream, body),
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
        let text = String::from_utf8_lossy(&buffer);

        if let Some(header_end) = text.find("\r\n\r\n") {
            if content_length == 0 {
                content_length = parse_content_length(&text[..header_end]);
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
        Ok(value) => match write_data(&value) {
            Ok(_) => send_json(stream, "200 OK", json!({"ok": true})),
            Err(_) => send_json(stream, "500 Internal Server Error", json!({"ok": false})),
        },
        Err(_) => send_json(stream, "400 Bad Request", json!({"ok": false, "error": "bad json"})),
    }
}

fn save_review(stream: &mut TcpStream, body: &str) {
    let Ok(review) = serde_json::from_str::<Value>(body) else {
        send_json(stream, "400 Bad Request", json!({"ok": false, "error": "bad json"}));
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
    reviews.as_array_mut().unwrap().insert(0, review);

    match write_data(&data) {
        Ok(_) => send_json(stream, "200 OK", json!({"ok": true})),
        Err(_) => send_json(stream, "500 Internal Server Error", json!({"ok": false})),
    }
}

fn check_admin_password(request: &str) -> bool {
    let expected = env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "skboy228".to_string());
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

    if provided == expected {
        return true;
    }

    load_data()
        .get("password")
        .and_then(Value::as_str)
        .map(|stored| stored == provided)
        .unwrap_or(false)
}

fn load_data() -> Value {
    fs::read_to_string(DATA_FILE)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_data(value: &Value) -> std::io::Result<()> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
    fs::write(DATA_FILE, bytes)
}

fn serve_file(stream: &mut TcpStream, path: &str) {
    let file_path = resolve_path(path);
    let (status, body, content_type) = match fs::read(&file_path) {
        Ok(body) => ("200 OK", body, content_type(&file_path)),
        Err(_) => ("404 Not Found", b"Not found".to_vec(), "text/plain; charset=utf-8"),
    };
    send_bytes(stream, status, body, content_type, "public, max-age=60");
}

fn send_json(stream: &mut TcpStream, status: &str, value: Value) {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    send_bytes(stream, status, body, "application/json; charset=utf-8", "no-store");
}

fn send_bytes(stream: &mut TcpStream, status: &str, body: Vec<u8>, content_type: &str, cache: &str) {
    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Type: {content_type}\r\nCache-Control: {cache}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(&body);
}

fn resolve_path(raw_path: &str) -> PathBuf {
    let clean = raw_path.split('?').next().unwrap_or("/").trim_start_matches('/');
    if clean.is_empty() || clean.contains("..") || clean.contains('\\') {
        return PathBuf::from("index.html");
    }
    PathBuf::from(clean)
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

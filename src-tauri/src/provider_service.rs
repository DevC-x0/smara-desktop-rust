use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use url::Url;

const PROVIDER_FILE: &str = "provider.json";
const HEALTH_TIMEOUT: Duration = Duration::from_millis(600);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DesktopProviderConfig {
    pub provider: String,
    pub model: String,
    pub endpoint: String,
}

impl Default for DesktopProviderConfig {
    fn default() -> Self {
        Self {
            provider: "custom".to_string(),
            model: "cx/gpt-5.5".to_string(),
            endpoint: "http://127.0.0.1:20128/v1".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopProviderHealth {
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub online: bool,
    pub latency_ms: u128,
    pub error: Option<String>,
}

fn normalize_provider_config(
    mut config: DesktopProviderConfig,
) -> Result<DesktopProviderConfig, String> {
    config.provider = config.provider.trim().to_ascii_lowercase();
    config.model = config.model.trim().to_string();
    config.endpoint = config.endpoint.trim().trim_end_matches('/').to_string();

    if !matches!(
        config.provider.as_str(),
        "custom" | "openai" | "anthropic" | "openrouter" | "ollama"
    ) {
        return Err(format!("Unsupported provider '{}'.", config.provider));
    }
    if config.model.is_empty() {
        return Err("Provider model cannot be empty.".to_string());
    }
    let parsed = Url::parse(&config.endpoint)
        .map_err(|error| format!("Provider endpoint is invalid: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Provider endpoint must use HTTP or HTTPS and include a host.".to_string());
    }
    Ok(config)
}

fn provider_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve Desktop config directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create Desktop config directory: {error}"))?;
    Ok(dir.join(PROVIDER_FILE))
}

pub(crate) fn load_provider_config(app: &AppHandle) -> Result<DesktopProviderConfig, String> {
    let path = provider_path(app)?;
    if !path.exists() {
        return Ok(DesktopProviderConfig::default());
    }
    let raw = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read Desktop provider config: {error}"))?;
    let config = serde_json::from_str(&raw)
        .map_err(|error| format!("Failed to parse Desktop provider config: {error}"))?;
    normalize_provider_config(config)
}

fn save_provider_config(
    app: &AppHandle,
    config: DesktopProviderConfig,
) -> Result<DesktopProviderConfig, String> {
    let config = normalize_provider_config(config)?;
    let raw = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("Failed to serialize Desktop provider config: {error}"))?;
    fs::write(provider_path(app)?, raw)
        .map_err(|error| format!("Failed to save Desktop provider config: {error}"))?;
    Ok(config)
}

fn check_provider(config: DesktopProviderConfig) -> DesktopProviderHealth {
    let started = Instant::now();
    let result = Url::parse(&config.endpoint)
        .map_err(|error| format!("Invalid endpoint: {error}"))
        .and_then(|url| {
            let host = url
                .host_str()
                .ok_or_else(|| "Provider endpoint has no host.".to_string())?;
            let port = url
                .port_or_known_default()
                .ok_or_else(|| "Provider endpoint has no known port.".to_string())?;
            let addresses = (host, port)
                .to_socket_addrs()
                .map_err(|error| format!("Provider DNS lookup failed: {error}"))?;

            let mut last_error = None;
            for address in addresses {
                match TcpStream::connect_timeout(&address, HEALTH_TIMEOUT) {
                    Ok(stream) => {
                        drop(stream);
                        return Ok(());
                    }
                    Err(error) => last_error = Some(error.to_string()),
                }
            }
            Err(last_error.unwrap_or_else(|| "Provider host resolved to no addresses.".to_string()))
        });

    DesktopProviderHealth {
        provider: config.provider,
        model: config.model,
        endpoint: config.endpoint,
        online: result.is_ok(),
        latency_ms: started.elapsed().as_millis(),
        error: result.err(),
    }
}

#[tauri::command]
pub fn get_desktop_provider_config(app: AppHandle) -> Result<DesktopProviderConfig, String> {
    load_provider_config(&app)
}

#[tauri::command]
pub fn save_desktop_provider_config(
    app: AppHandle,
    config: DesktopProviderConfig,
) -> Result<DesktopProviderConfig, String> {
    save_provider_config(&app, config)
}

#[tauri::command]
pub async fn check_desktop_provider_health(
    app: AppHandle,
) -> Result<DesktopProviderHealth, String> {
    let config = load_provider_config(&app)?;
    tauri::async_runtime::spawn_blocking(move || check_provider(config))
        .await
        .map_err(|error| format!("Failed to wait for provider health check: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{check_provider, normalize_provider_config, DesktopProviderConfig, HEALTH_TIMEOUT};
    use std::net::TcpListener;
    use std::time::Duration;

    #[test]
    fn normalizes_supported_provider_config() {
        let config = normalize_provider_config(DesktopProviderConfig {
            provider: " CUSTOM ".to_string(),
            model: " model-a ".to_string(),
            endpoint: "http://127.0.0.1:20128/v1/".to_string(),
        })
        .unwrap();

        assert_eq!(config.provider, "custom");
        assert_eq!(config.model, "model-a");
        assert_eq!(config.endpoint, "http://127.0.0.1:20128/v1");
    }

    #[test]
    fn rejects_invalid_provider_config() {
        let mut config = DesktopProviderConfig::default();
        config.provider = "unknown".to_string();
        assert!(normalize_provider_config(config).is_err());

        let mut config = DesktopProviderConfig::default();
        config.endpoint = "not-a-url".to_string();
        assert!(normalize_provider_config(config).is_err());
    }

    #[test]
    fn reports_reachable_local_provider() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let config = DesktopProviderConfig {
            provider: "custom".to_string(),
            model: "test-model".to_string(),
            endpoint: format!("http://{}", listener.local_addr().unwrap()),
        };

        let health = check_provider(config);
        assert!(health.online);
        assert!(health.error.is_none());
        assert!(HEALTH_TIMEOUT >= Duration::from_millis(100));
    }
}

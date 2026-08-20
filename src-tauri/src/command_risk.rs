use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    SafeReadOnly,
    WorkspaceMutation,
    DangerousDestructive,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommandRiskAssessment {
    pub level: RiskLevel,
    pub risk_score: u8, // 0 = Safe, 1 = Mutation, 2 = Dangerous
    pub reason: String,
    pub requires_explicit_confirmation: bool,
    pub matched_patterns: Vec<String>,
}

impl Default for CommandRiskAssessment {
    fn default() -> Self {
        Self {
            level: RiskLevel::SafeReadOnly,
            risk_score: 0,
            reason: "Perintah read-only aman dijalankan.".to_string(),
            requires_explicit_confirmation: false,
            matched_patterns: Vec::new(),
        }
    }
}

/// Evaluates the security risk level of a shell command before execution
pub fn evaluate_command_risk(command: &str, _workspace_root: Option<&Path>) -> CommandRiskAssessment {
    let raw = command.trim();
    if raw.is_empty() {
        return CommandRiskAssessment::default();
    }

    let mut matched_patterns = Vec::new();
    let lower = raw.to_lowercase();

    // 1. Critical Destructive Command Patterns
    let critical_patterns = [
        ("rm -rf", "Menghapus direktori/file secara rekursif dan paksa"),
        ("rm -fr", "Menghapus direktori/file secara rekursif dan paksa"),
        ("git reset --hard", "Menghapus semua perubahan kode lokal tanpa cadangan"),
        ("git clean -f", "Menghapus file yang belum di-track oleh git"),
        ("git push --force", "Menimpa riwayat branch remote secara paksa"),
        ("git push -f", "Menimpa riwayat branch remote secara paksa"),
        ("mkfs", "Format sistem berkas partisi disk"),
        ("dd if=", "Operasi low-level write ke disk/partisi"),
        ("chmod -r 777", "Membuka permission penuh ke semua file/direktori"),
        ("chmod 777", "Membuka permission eksekusi publik"),
        ("chmod -r 000", "Mengunci akses direktori secara permanen"),
        ("chown -r", "Mengubah kepemilikan file secara rekursif"),
        ("kill -9", "Mematikan proses sistem secara paksa"),
        ("pkill -9", "Mematikan proses sistem secara massal"),
        ("shutdown", "Mematikan mesin/sistem"),
        ("reboot", "Me-restart sistem operasi"),
        (":(){ :|:& };:", "Fork bomb yang dapat membekukan sistem"),
        ("drop database", "Menghapus seluruh database"),
        ("drop table", "Menghapus tabel database"),
        ("truncate table", "Mengosongkan isi tabel database"),
    ];

    for (pat, desc) in critical_patterns {
        if lower.contains(pat) {
            matched_patterns.push(format!("{pat} ({desc})"));
        }
    }

    // 2. Sensitive Path Target Checks
    let sensitive_paths = [
        ("/etc", "Direktori konfigurasi sistem root"),
        ("/boot", "File boot loader kernel sistem"),
        ("/root", "Home direktori superuser"),
        ("/dev", "Device block / sistem file virtual"),
        ("~/.ssh", "Kunci otentikasi SSH dan private keys"),
        ("/.ssh", "Kunci otentikasi SSH dan private keys"),
        ("~/.bashrc", "File konfigurasi startup shell user"),
        ("~/.zshrc", "File konfigurasi startup shell user"),
        ("/etc/passwd", "Database akun sistem"),
        ("/etc/shadow", "Database hash password akun"),
        ("/etc/sudoers", "Konfigurasi hak akses superuser sudo"),
    ];

    for (path, desc) in sensitive_paths {
        if lower.contains(path) {
            matched_patterns.push(format!("Akses ke path sensitif '{path}' ({desc})"));
        }
    }

    if !matched_patterns.is_empty() {
        return CommandRiskAssessment {
            level: RiskLevel::DangerousDestructive,
            risk_score: 2,
            reason: format!(
                "Perintah terdeteksi berisiko tinggi / destruktif: {}",
                matched_patterns.join("; ")
            ),
            requires_explicit_confirmation: true,
            matched_patterns,
        };
    }

    // 3. Workspace Mutation Patterns (Level 1)
    let mutation_keywords = [
        "touch", "mkdir", "mv ", "cp ", "sed -i", "cargo build", "cargo run",
        "npm install", "npm i", "yarn add", "pnpm add", "pip install", "go get",
        "git checkout", "git branch", "git commit", "git merge", "git rebase",
        "git add", "git stash", "tar -x", "unzip", "curl -o", "wget",
    ];

    let mut mutation_matches = Vec::new();
    for kw in mutation_keywords {
        if lower.contains(kw) {
            mutation_matches.push(kw.to_string());
        }
    }

    if !mutation_matches.is_empty() || raw.contains('>') {
        return CommandRiskAssessment {
            level: RiskLevel::WorkspaceMutation,
            risk_score: 1,
            reason: "Perintah memodifikasi berkas atau dependensi dalam workspace.".to_string(),
            requires_explicit_confirmation: false,
            matched_patterns: mutation_matches,
        };
    }

    // 4. Safe Read-Only (Level 0)
    CommandRiskAssessment {
        level: RiskLevel::SafeReadOnly,
        risk_score: 0,
        reason: "Perintah read-only aman (inspeksi atau pembacaan status).".to_string(),
        requires_explicit_confirmation: false,
        matched_patterns: Vec::new(),
    }
}

#[tauri::command]
pub fn evaluate_desktop_command_risk(command: String) -> CommandRiskAssessment {
    evaluate_command_risk(&command, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_read_only_commands() {
        let cmd1 = "ls -la src/";
        let assess1 = evaluate_command_risk(cmd1, None);
        assert_eq!(assess1.level, RiskLevel::SafeReadOnly);
        assert_eq!(assess1.risk_score, 0);
        assert!(!assess1.requires_explicit_confirmation);

        let cmd2 = "git status && git diff";
        let assess2 = evaluate_command_risk(cmd2, None);
        assert_eq!(assess2.level, RiskLevel::SafeReadOnly);

        let cmd3 = "df -h && du -h /home/cahya";
        let assess3 = evaluate_command_risk(cmd3, None);
        assert_eq!(assess3.level, RiskLevel::SafeReadOnly);
    }

    #[test]
    fn test_workspace_mutation_commands() {
        let cmd1 = "cargo build --release";
        let assess1 = evaluate_command_risk(cmd1, None);
        assert_eq!(assess1.level, RiskLevel::WorkspaceMutation);
        assert_eq!(assess1.risk_score, 1);
        assert!(!assess1.requires_explicit_confirmation);

        let cmd2 = "npm install express";
        let assess2 = evaluate_command_risk(cmd2, None);
        assert_eq!(assess2.level, RiskLevel::WorkspaceMutation);

        let cmd3 = "mkdir -p dist && echo 'test' > dist/output.txt";
        let assess3 = evaluate_command_risk(cmd3, None);
        assert_eq!(assess3.level, RiskLevel::WorkspaceMutation);
    }

    #[test]
    fn test_dangerous_destructive_commands() {
        let cmd1 = "rm -rf /home/cahya/important_project";
        let assess1 = evaluate_command_risk(cmd1, None);
        assert_eq!(assess1.level, RiskLevel::DangerousDestructive);
        assert_eq!(assess1.risk_score, 2);
        assert!(assess1.requires_explicit_confirmation);
        assert!(assess1.reason.contains("rm -rf"));

        let cmd2 = "git reset --hard HEAD~1";
        let assess2 = evaluate_command_risk(cmd2, None);
        assert_eq!(assess2.level, RiskLevel::DangerousDestructive);
        assert!(assess2.requires_explicit_confirmation);

        let cmd3 = "cat ~/.ssh/id_rsa";
        let assess3 = evaluate_command_risk(cmd3, None);
        assert_eq!(assess3.level, RiskLevel::DangerousDestructive);
        assert!(assess3.reason.contains("~/.ssh"));

        let cmd4 = "chmod 777 /etc/passwd";
        let assess4 = evaluate_command_risk(cmd4, None);
        assert_eq!(assess4.level, RiskLevel::DangerousDestructive);
    }
}

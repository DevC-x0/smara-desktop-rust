.PHONY: dev dev-debug build check test clean

# Native standalone Smara Desktop lifecycle.
dev:
	npm run dev

dev-debug:
	npm run dev:debug

build:
	npm run build

check:
	npm run check
	cargo check --manifest-path src-tauri/Cargo.toml

test:
	npm run test:smoke
	cargo test --manifest-path src-tauri/Cargo.toml

clean:
	cargo clean --manifest-path src-tauri/Cargo.toml
	rm -rf dist

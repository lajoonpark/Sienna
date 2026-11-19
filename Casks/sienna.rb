cask "sienna" do
  arch arm: "arm64", intel: "x64"

  version "0.1.0"
  sha256 arm:   :no_check,
         intel: :no_check

  url "https://github.com/lajoonpark/Sienna/releases/download/v#{version}/Sienna-#{version}-mac-#{arch}.zip"
  name "Sienna"
  desc "Free, open-source 3D oil-painted vinyl record shop for YouTube Music"
  homepage "https://github.com/lajoonpark/Sienna"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Sienna.app"

  # Sienna is an unsigned open-source app (no paid Apple Developer certificate).
  # Automatically strip macOS quarantine on install so Gatekeeper does not block first launch.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Sienna.app"],
                   sudo: false
  end

  caveats <<~EOS
    Sienna is free, open-source software and is NOT code-signed or notarized by Apple.
    To let it launch cleanly, this Homebrew Cask automatically ran:

      xattr -dr com.apple.quarantine #{appdir}/Sienna.app

    You can inspect the full source code and build workflow at:
      https://github.com/lajoonpark/Sienna
  EOS

  zap trash: [
    "~/Library/Application Support/sienna-app",
    "~/Library/Preferences/com.lajoonpark.sienna.plist",
    "~/Library/Saved Application State/com.lajoonpark.sienna.savedState",
  ]
end

import AppKit
import SiennaCore

final class AppDelegate: NSObject, NSApplicationDelegate {

    private let hotkey = GlobalHotkey()
    private let panel = SiennaPanel()
    private let suitcase = SuitcaseView(frame: NSRect(origin: .zero, size: SuitcaseView.size))
    private var statusItem: NSStatusItem?
    private var outsideClickMonitor: Any?
    private var pollTimer: Timer?
    private var isRefreshing = false
    private var artworkURL: URL?

    private let backend: MusicBackend = KasetBackend()
    /// Turning the knob makes many volumes a second; only the newest is sent to Kaset.
    private lazy var volumeSender = CoalescingSender<Double> { [backend] volume in
        await backend.send(.setVolume(volume))
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel.contentView = suitcase
        panel.setContentSize(SuitcaseView.size)

        suitcase.canScrub = backend.canSeek
        suitcase.onCommand = { [weak self] command in self?.send(command) }
        suitcase.onVolume = { [weak self] volume in
            guard let self else { return }
            Task { await self.volumeSender.submit(volume) }
        }
        suitcase.onSeek = { [weak self] seconds in
            guard let self else { return }
            Task { await self.backend.send(.seek(to: seconds)) }
        }
        suitcase.onDismissRequest = { [weak self] in self?.suitcase.dismiss() }
        suitcase.onClosed = { [weak self] in self?.finishHiding() }
        suitcase.prewarm()

        setUpStatusItem()

        let spec = HotkeySpec.default
        if !hotkey.register(spec, action: { [weak self] in self?.toggle() }) {
            siennaLog("Sienna: \(spec.displayName) is already taken by another app")
        }
    }

    // MARK: Menu bar

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "opticaldisc", accessibilityDescription: "Sienna")
        let menu = NSMenu()
        let show = menu.addItem(withTitle: "Open Suitcase (\(HotkeySpec.default.displayName))", action: #selector(show), keyEquivalent: "")
        show.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Sienna", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        statusItem = item
    }

    // MARK: Showing and hiding

    @objc private func show() {
        if !panel.isVisible {
            let mouse = NSEvent.mouseLocation
            let size = SuitcaseView.size
            let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
            var origin = NSPoint(x: mouse.x - size.width / 2, y: mouse.y - size.height / 2)
            if let frame = screen?.visibleFrame {
                origin.x = min(max(origin.x, frame.minX), frame.maxX - size.width)
                origin.y = min(max(origin.y, frame.minY), frame.maxY - size.height)
            }
            panel.alphaValue = 0 // the suitcase fades it in once its first frame is ready
            panel.setFrame(NSRect(origin: origin, size: size), display: true)
            panel.makeKeyAndOrderFront(nil)
        }
        panel.makeFirstResponder(suitcase)
        suitcase.summon()

        refresh()
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.refresh() }

        // A click anywhere outside the suitcase's window shuts it.
        if outsideClickMonitor == nil {
            outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
                self?.suitcase.dismiss()
            }
        }
    }

    /// The lid has shut and the case has faded: now the window can go.
    private func finishHiding() {
        panel.orderOut(nil)
        pollTimer?.invalidate()
        pollTimer = nil
        if let outsideClickMonitor {
            NSEvent.removeMonitor(outsideClickMonitor)
            self.outsideClickMonitor = nil
        }
    }

    private func toggle() {
        if panel.isVisible && !suitcase.isClosing {
            suitcase.dismiss()
        } else {
            show()
        }
    }

    // MARK: Player

    private func send(_ command: PlayerCommand) {
        Task { [weak self] in
            guard let self else { return }
            await backend.send(command)
            // Kaset takes a moment to report a change, so ask again shortly after.
            await refreshNow()
            try? await Task.sleep(nanoseconds: 500_000_000)
            await refreshNow()
        }
    }

    private func refresh() {
        guard !isRefreshing else { return }
        isRefreshing = true
        Task { [weak self] in
            await self?.refreshNow()
            self?.isRefreshing = false
        }
    }

    private func refreshNow() async {
        let now = await backend.nowPlaying()
        await MainActor.run {
            suitcase.apply(now)
            updateArtwork(for: now)
        }
    }

    private func updateArtwork(for now: NowPlaying) {
        guard now.artworkURL != artworkURL else { return }
        artworkURL = now.artworkURL
        guard let url = now.artworkURL else {
            suitcase.apply(artwork: nil)
            return
        }
        Task { [weak self] in
            let data = await ArtworkDownloader.fetch(url)
            let image = data.flatMap { NSImage(data: $0) }
            await MainActor.run {
                // Ignore a slow download for a song that is no longer playing.
                guard let self, self.artworkURL == url else { return }
                self.suitcase.apply(artwork: image)
            }
        }
    }
}

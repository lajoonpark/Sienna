import AppKit
import Carbon.HIToolbox
import SiennaCore

/// System-wide hotkey via Carbon's `RegisterEventHotKey`: no Accessibility permission and no
/// background CPU, so the app stays invisible until called.
final class GlobalHotkey {

    private static let signature: OSType = 0x43444E31 // 'CDN1'

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandler: EventHandlerRef?
    private var action: (() -> Void)?

    /// Set when another app already owns the combination.
    private(set) var lastRegistrationFailed = false

    init() { installHandler() }

    deinit {
        unregister()
        if let eventHandler { RemoveEventHandler(eventHandler) }
    }

    @discardableResult
    func register(_ spec: HotkeySpec, action: @escaping () -> Void) -> Bool {
        unregister()
        guard spec.isValid else {
            lastRegistrationFailed = true
            return false
        }
        self.action = action

        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(
            spec.keyCode,
            carbonModifiers(from: spec),
            EventHotKeyID(signature: GlobalHotkey.signature, id: 1),
            GetApplicationEventTarget(),
            0,
            &ref
        )
        guard status == noErr, let ref else {
            lastRegistrationFailed = true
            NSLog("Sienna: could not register \(spec.displayName) (OSStatus \(status))")
            return false
        }
        hotKeyRef = ref
        lastRegistrationFailed = false
        return true
    }

    func unregister() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
    }

    private func carbonModifiers(from spec: HotkeySpec) -> UInt32 {
        var flags: UInt32 = 0
        if spec.command { flags |= UInt32(cmdKey) }
        if spec.option { flags |= UInt32(optionKey) }
        if spec.control { flags |= UInt32(controlKey) }
        if spec.shift { flags |= UInt32(shiftKey) }
        return flags
    }

    private func installHandler() {
        var spec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let event, let userData else { return noErr }
                var hotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID
                )
                guard status == noErr, hotKeyID.signature == GlobalHotkey.signature else { return noErr }
                let hotkey = Unmanaged<GlobalHotkey>.fromOpaque(userData).takeUnretainedValue()
                DispatchQueue.main.async { hotkey.action?() }
                return noErr
            },
            1,
            &spec,
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandler
        )
    }
}

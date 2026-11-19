import Foundation

/// Everything on the suitcase you can touch. The raw value is the SceneKit node name, so a
/// hit-test result maps straight back to a control.
public enum SuitcaseControl: String, CaseIterable, Sendable {
    case previous = "ctl.previous"
    case playPause = "ctl.playPause"
    case next = "ctl.next"
    case like = "ctl.like"
    case knob = "ctl.knob"
    case record = "ctl.record"

    /// A button you click, as opposed to the knob and record you drag.
    public var isButton: Bool {
        switch self {
        case .previous, .playPause, .next, .like: true
        case .knob, .record: false
        }
    }

    public var command: PlayerCommand? {
        switch self {
        case .previous: .previous
        case .playPause: .togglePlayPause
        case .next: .next
        case .like: .like
        case .knob, .record: nil
        }
    }
}

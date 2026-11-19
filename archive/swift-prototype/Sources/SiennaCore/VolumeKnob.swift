import Foundation

/// The volume knob's maths: how scrolling and dragging map to a volume, and where the knob's
/// pointer sits for a volume. Pure, so it is tested on any platform.
///
/// Volume is 0...1. The knob sweeps `sweep` radians, centred on 12 o'clock like a real hi-fi
/// knob, with a dead gap at the bottom. Angles are **clockwise from 12 o'clock**, so a knob at
/// minimum points at about 7 o'clock and at maximum at about 5 o'clock.
public struct VolumeKnob: Equatable, Sendable {

    /// 270°: the usual knob throw.
    public static let sweep: Double = 1.5 * .pi
    public static let minAngle: Double = -sweep / 2
    public static let maxAngle: Double = sweep / 2

    public private(set) var volume: Double

    public init(volume: Double = 0.5) {
        self.volume = VolumeKnob.clamp(volume)
    }

    /// Pointer angle for the current volume, relative to 12 o'clock (negative = left).
    public var angle: Double { VolumeKnob.angle(for: volume) }

    public static func angle(for volume: Double) -> Double {
        minAngle + clamp(volume) * sweep
    }

    public static func clamp(_ v: Double) -> Double { min(max(v, 0), 1) }

    // MARK: Scrolling

    /// Volume change for one scroll event, positive = louder.
    ///
    /// Scrolling *up* is louder, whichever way the user's "natural scrolling" setting points:
    /// `invertedFromDevice` is `NSEvent.isDirectionInvertedFromDevice`, and flips the sign back
    /// to the physical direction of the fingers or wheel. A trackpad reports points (a full
    /// range takes about 300 of them); a wheel reports whole lines (about 20 notches).
    public static func volumeChange(scrollDeltaY: Double, precise: Bool, invertedFromDevice: Bool) -> Double {
        let physical = invertedFromDevice ? -scrollDeltaY : scrollDeltaY
        return physical * (precise ? 1.0 / 300.0 : 1.0 / 20.0)
    }

    public mutating func adjust(by delta: Double) {
        volume = VolumeKnob.clamp(volume + delta)
    }

    public mutating func set(_ value: Double) {
        volume = VolumeKnob.clamp(value)
    }

    // MARK: Dragging

    /// Follows the pointer around the knob. `pointerAngle` is the pointer's angle about the
    /// knob's centre, clockwise from 12 o'clock, in any range.
    ///
    /// The pointer cannot jump across the gap at the bottom: inside the gap the knob stays at
    /// whichever end it is nearer to, so dragging past maximum sticks at maximum instead of
    /// flipping to silence.
    public mutating func drag(toPointerAngle pointerAngle: Double) {
        var a = pointerAngle.truncatingRemainder(dividingBy: 2 * .pi)
        if a > .pi { a -= 2 * .pi }
        if a < -.pi { a += 2 * .pi }
        if a < VolumeKnob.minAngle || a > VolumeKnob.maxAngle {
            volume = volume >= 0.5 ? 1 : 0
        } else {
            volume = (a - VolumeKnob.minAngle) / VolumeKnob.sweep
        }
    }
}

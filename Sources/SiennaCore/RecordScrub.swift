import Foundation

/// Scrubbing with the record: turn it clockwise to go forward, anticlockwise to go back, like
/// dragging a platter. Pure maths; the view feeds it the pointer's angle about the record's
/// centre (clockwise from 12 o'clock, `RecordLayout.angle`).
public struct RecordScrub: Equatable, Sendable {

    /// How far one full turn of the record moves the song.
    public static let secondsPerTurn: Double = 20

    public let startPosition: Double
    public let duration: Double
    private var lastAngle: Double
    /// Total turn since the grab, in radians. Unwrapped, so it can go past a full circle.
    public private(set) var turned: Double = 0

    public init(grabAngle: Double, position: Double, duration: Double) {
        self.lastAngle = grabAngle
        self.startPosition = max(0, position)
        self.duration = max(0, duration)
    }

    /// Feeds the next pointer angle. The step is taken the short way round, so crossing 12
    /// o'clock (359° → 1°) is a 2° turn, not a 358° one.
    public mutating func update(angle: Double) {
        var step = angle - lastAngle
        while step > .pi { step -= 2 * .pi }
        while step < -.pi { step += 2 * .pi }
        turned += step
        lastAngle = angle
    }

    /// Where the song would be now, kept inside the song.
    public var position: Double {
        let target = startPosition + turned / (2 * .pi) * RecordScrub.secondsPerTurn
        return min(max(target, 0), duration)
    }

    /// 0...1 through the song.
    public var progress: Double {
        duration > 0 ? position / duration : 0
    }
}

import Foundation

/// Where everything sits on the suitcase, in scene units. Shared by the SceneKit scene (which
/// builds it) and the tests (which check it hangs together), so the geometry that matters, such
/// as the tonearm actually reaching the record, is verified on any platform.
///
/// The case sits on the floor with its centre over the origin. `x` runs left to right, `z`
/// towards the viewer (the front of the case) and `y` up. A `DeckPoint` is a position on the
/// deck's surface, so `(x, z)` only.
public struct DeckPoint: Equatable, Sendable {
    public var x: Double
    public var z: Double
    public init(x: Double, z: Double) { self.x = x; self.z = z }

    func distance(to other: DeckPoint) -> Double {
        ((x - other.x) * (x - other.x) + (z - other.z) * (z - other.z)).squareRoot()
    }
}

public enum SuitcaseLayout {
    // Case
    public static let caseWidth = 4.6
    public static let caseDepth = 3.2
    public static let baseHeight = 0.95
    public static let lidHeight = 0.55
    /// Leather frame left around the deck plate.
    public static let deckInset = 0.14
    /// Top surface of the deck plate.
    public static let deckHeight = baseHeight + 0.01

    // Record
    public static let record = DeckPoint(x: -0.85, z: 0.12)
    public static let recordRadius = 1.12
    public static let platterRadius = 1.2
    /// The artwork in the middle of the record.
    public static let labelRadius = 0.42
    /// Height of the record's top face above the deck.
    public static let recordTop = deckHeight + 0.07

    // Volume knob
    public static let knob = DeckPoint(x: 1.5, z: 0.15)
    public static let knobRadius = 0.3

    // Buttons, in a row along the front of the deck, to the right of the record.
    public static func button(_ control: SuitcaseControl) -> (center: DeckPoint, radius: Double)? {
        switch control {
        case .previous: (DeckPoint(x: 0.80, z: 1.05), 0.15)
        case .playPause: (DeckPoint(x: 1.18, z: 1.05), 0.19)
        case .next: (DeckPoint(x: 1.56, z: 1.05), 0.15)
        case .like: (DeckPoint(x: 1.94, z: 1.05), 0.14)
        case .knob, .record: nil
        }
    }

    /// Half the deck plate's size.
    public static var deckHalfWidth: Double { caseWidth / 2 - deckInset }
    public static var deckHalfDepth: Double { caseDepth / 2 - deckInset }
}

/// The tonearm: a straight arm of fixed length pivoting at the back right, whose stylus runs
/// from the outer groove to the inner groove as the song plays.
public enum Tonearm {
    public static let pivot = DeckPoint(x: 1.75, z: -1.0)
    public static let length = 2.4
    /// Distance of the stylus from the record's centre at the start and end of the song.
    public static let outerRadius = 1.0
    public static let innerRadius = 0.55
    /// How far the arm swings outward, in radians, when parked or when nothing is playing.
    public static let parkOffset = 0.32

    /// The stylus position for a given distance from the record's centre: where a circle of
    /// that radius about the record meets the circle the arm can reach. Of the two meeting
    /// points, the one towards the back of the case, so the arm never crosses the knob or
    /// buttons. Nil if the arm cannot reach that radius.
    public static func stylus(atRadius radius: Double) -> DeckPoint? {
        let c = SuitcaseLayout.record
        let d = pivot.distance(to: c)
        guard d > 0 else { return nil }
        let a = (length * length - radius * radius + d * d) / (2 * d)
        let h2 = length * length - a * a
        guard h2 >= 0 else { return nil }
        let h = h2.squareRoot()
        let ux = (c.x - pivot.x) / d
        let uz = (c.z - pivot.z) / d
        let mid = DeckPoint(x: pivot.x + a * ux, z: pivot.z + a * uz)
        let one = DeckPoint(x: mid.x - h * uz, z: mid.z + h * ux)
        let two = DeckPoint(x: mid.x + h * uz, z: mid.z - h * ux)
        return one.z <= two.z ? one : two
    }

    /// Rotation about the vertical axis (the scene's y) for an arm modelled pointing along
    /// local -x, so that its tip lands on the stylus.
    public static func angle(atRadius radius: Double) -> Double? {
        guard let s = stylus(atRadius: radius) else { return nil }
        return atan2(s.z - pivot.z, -(s.x - pivot.x))
    }

    /// 0 = start of the song, 1 = end.
    public static func angle(forProgress progress: Double) -> Double {
        let p = min(max(progress, 0), 1)
        let radius = outerRadius + (innerRadius - outerRadius) * p
        return angle(atRadius: radius) ?? 0
    }

    /// Where the arm rests when nothing is playing: swung clear of the record.
    public static var parkedAngle: Double {
        angle(forProgress: 0) + parkOffset
    }
}

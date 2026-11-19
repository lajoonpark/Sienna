import AppKit
import SceneKit
import SiennaCore

/// The 3D suitcase: a tan leather case with a cream lining in the lid and a record player in the
/// base. This type only builds the scene and exposes setters for what changes (lid angle, record
/// turn, knob, tonearm, artwork, button glyphs). Input and animation live in `SuitcaseView`.
///
/// Scene units: the case sits on the floor, centred over the origin. `x` right, `y` up, `z`
/// towards the viewer. Sizes come from `SuitcaseLayout`, shared with the tests.
final class SuitcaseScene {

    typealias L = SuitcaseLayout

    let scene = SCNScene()
    let cameraNode = SCNNode()
    /// The whole case. The view dips it when the lid lands and lifts it in on arrival.
    let caseRoot = SCNNode()
    /// Leans the whole case toward the cursor, about its middle.
    private let tiltNode = SCNNode()
    /// Catches the shadow.
    let floorNode = SCNNode()

    private let lidPivot = SCNNode()
    private let recordSpin = SCNNode()
    private let tonearmPivot = SCNNode()
    private let knobNode = SCNNode()
    private let labelMaterial = SCNMaterial()

    /// The part of each button that moves when pressed.
    private var caps: [SuitcaseControl: SCNNode] = [:]
    private var bodyMaterials: [SuitcaseControl: SCNMaterial] = [:]
    private var glyphMaterials: [SuitcaseControl: SCNMaterial] = [:]
    private var glyphs: [String: CGImage] = [:]

    // Shared materials
    private let leather = SuitcaseScene.pbr(.white, roughness: 0.78)
    private let lining = SuitcaseScene.pbr(.white, roughness: 0.92)
    private let brass = SuitcaseScene.pbr(NSColor(srgbRed: 0.72, green: 0.54, blue: 0.24, alpha: 1), roughness: 0.42, metalness: 1)
    private let deckBlack = SuitcaseScene.pbr(NSColor(white: 0.045, alpha: 1), roughness: 0.55, metalness: 0.15)
    private let steel = SuitcaseScene.pbr(NSColor(white: 0.55, alpha: 1), roughness: 0.35, metalness: 1)

    init() {
        configureMaterials()
        buildEnvironment()
        buildBase()
        buildLid()
        buildFront()
        buildRecord()
        buildTonearm()
        buildKnob()
        buildButtons()
        tiltNode.position = SCNVector3(0, 0.6, 0)
        tiltNode.pivot = SCNMatrix4MakeTranslation(0, 0.6, 0)
        tiltNode.addChildNode(caseRoot)
        scene.rootNode.addChildNode(tiltNode)
    }

    // MARK: Setters

    /// 0 = shut. Positive opens it: the front edge swings up and back over the hinge.
    func setLid(angle: Double) {
        lidPivot.eulerAngles.x = CGFloat(-angle)
    }

    /// Leans the case: `pitch` tips the front down, `roll` tips the right side down (both radians).
    func setTilt(pitch: Double, roll: Double) {
        tiltNode.eulerAngles = SCNVector3(CGFloat(pitch), 0, CGFloat(-roll))
        // Tipping about the middle sinks the low edge below the floor, so lift the case by
        // exactly that much: it leans on its corner instead of dropping through the ground.
        let dip = L.caseDepth / 2 * abs(sin(pitch)) + L.caseWidth / 2 * abs(sin(roll))
        tiltNode.position = SCNVector3(0, CGFloat(0.6 + dip), 0)
    }

    /// A point in view-ray space (as `unprojectPoint` returns) in the case's own frame, so the
    /// controls are found correctly while the case is leaning, dipping or arriving.
    func caseLocal(_ point: SCNVector3) -> SCNVector3 {
        caseRoot.convertPosition(point, from: nil)
    }

    /// Radians, clockwise as seen from above.
    func setRecord(angle: Double) {
        recordSpin.eulerAngles.y = CGFloat(-angle)
    }

    func setTonearm(angle: Double) {
        tonearmPivot.eulerAngles.y = CGFloat(angle)
    }

    func setKnob(volume: Double) {
        knobNode.eulerAngles.y = CGFloat(-VolumeKnob.angle(for: volume))
    }

    func setPlaying(_ playing: Bool) {
        glyphMaterials[.playPause]?.diffuse.contents = glyph(playing ? "pause.fill" : "play.fill")
    }

    func setLiked(_ liked: Bool) {
        glyphMaterials[.like]?.diffuse.contents = glyph(liked ? "heart.fill" : "heart", liked: liked)
    }

    func setArtwork(_ image: NSImage?) {
        labelMaterial.diffuse.contents = SuitcaseTextures.label(artwork: image)
    }

    /// Lights up the control under the pointer.
    func setHover(_ control: SuitcaseControl?) {
        for (c, material) in bodyMaterials {
            material.emission.contents = NSColor(white: c == control ? 0.16 : 0, alpha: 1)
        }
    }

    /// Sinks the pressed button into the deck.
    func setPressed(_ control: SuitcaseControl?) {
        for (c, cap) in caps {
            cap.position.y = c == control ? -0.025 : 0
        }
    }

    // MARK: Picking

    /// The control a hit node belongs to, found by walking up to the node that carries a control's name.
    static func control(for node: SCNNode) -> SuitcaseControl? {
        var current: SCNNode? = node
        while let n = current {
            if let name = n.name, let control = SuitcaseControl(rawValue: name) { return control }
            current = n.parent
        }
        return nil
    }

    /// The floor only exists to catch the shadow; it must not count as part of the case.
    static func isFloor(_ node: SCNNode) -> Bool {
        var current: SCNNode? = node
        while let n = current {
            if n.name == "floor" { return true }
            current = n.parent
        }
        return false
    }

    // MARK: Materials

    private static func pbr(_ color: NSColor, roughness: CGFloat, metalness: CGFloat = 0) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = color
        m.roughness.contents = roughness
        m.metalness.contents = metalness
        return m
    }

    private func configureMaterials() {
        leather.diffuse.contents = SuitcaseTextures.leather()
        leather.diffuse.wrapS = .repeat
        leather.diffuse.wrapT = .repeat
        leather.diffuse.contentsTransform = SCNMatrix4MakeScale(5, 5, 1)

        lining.diffuse.contents = SuitcaseTextures.lining()
        lining.diffuse.wrapS = .repeat
        lining.diffuse.wrapT = .repeat
        lining.diffuse.contentsTransform = SCNMatrix4MakeScale(3, 3, 1)

        labelMaterial.lightingModel = .physicallyBased
        labelMaterial.roughness.contents = 0.6
        labelMaterial.metalness.contents = 0.0
        labelMaterial.diffuse.contents = SuitcaseTextures.label(artwork: nil)
    }

    private func glyph(_ symbol: String, liked: Bool = false) -> CGImage? {
        let key = symbol + (liked ? "!" : "")
        if let cached = glyphs[key] { return cached }
        let tint = liked
            ? NSColor(srgbRed: 0.96, green: 0.32, blue: 0.38, alpha: 1)
            : NSColor(srgbRed: 0.95, green: 0.91, blue: 0.82, alpha: 1)
        let image = SuitcaseTextures.glyph(symbol, tint: tint)
        glyphs[key] = image
        return image
    }

    // MARK: Geometry helpers

    private func box(_ w: Double, _ h: Double, _ l: Double, chamfer: Double = 0, _ m: SCNMaterial) -> SCNNode {
        let g = SCNBox(width: CGFloat(w), height: CGFloat(h), length: CGFloat(l), chamferRadius: CGFloat(chamfer))
        g.materials = [m, m, m, m, m, m]
        return SCNNode(geometry: g)
    }

    private func cylinder(_ r: Double, _ h: Double, _ m: SCNMaterial) -> SCNNode {
        let g = SCNCylinder(radius: CGFloat(r), height: CGFloat(h))
        g.materials = [m, m, m]
        return SCNNode(geometry: g)
    }

    private func at(_ node: SCNNode, _ x: Double, _ y: Double, _ z: Double) -> SCNNode {
        node.position = SCNVector3(CGFloat(x), CGFloat(y), CGFloat(z))
        return node
    }

    /// A flat image laid on the deck, facing up. `w`'s +x is the scene's +x and the image's
    /// top points away from the viewer.
    private func flatPlane(_ w: Double, _ h: Double, _ m: SCNMaterial) -> SCNNode {
        let g = SCNPlane(width: CGFloat(w), height: CGFloat(h))
        g.materials = [m]
        let node = SCNNode(geometry: g)
        node.eulerAngles.x = -.pi / 2
        return node
    }

    // MARK: Build

    private func buildEnvironment() {
        scene.background.contents = NSColor.clear
        scene.lightingEnvironment.contents = SuitcaseTextures.studio()
        scene.lightingEnvironment.intensity = 1.1

        let sun = SCNNode()
        let light = SCNLight()
        light.type = .directional
        light.intensity = 800
        light.castsShadow = true
        light.shadowMode = .deferred
        light.shadowColor = NSColor(white: 0, alpha: 0.42)
        light.shadowRadius = 9
        light.shadowSampleCount = 8
        light.shadowMapSize = CGSize(width: 2048, height: 2048)
        light.zNear = 1
        light.zFar = 40
        sun.light = light
        sun.eulerAngles = SCNVector3(-CGFloat.pi / 3, -CGFloat.pi / 8, 0)
        sun.position = SCNVector3(-3, 12, 8)
        scene.rootNode.addChildNode(sun)

        // Shadow catcher: invisible except where the case shades it.
        let floorMaterial = SCNMaterial()
        floorMaterial.lightingModel = .shadowOnly
        // Never hide the case: it only receives the shadow.
        floorMaterial.writesToDepthBuffer = false
        floorMaterial.readsFromDepthBuffer = false
        let plane = SCNPlane(width: 18, height: 18)
        plane.materials = [floorMaterial]
        floorNode.geometry = plane
        floorNode.name = "floor"
        floorNode.renderingOrder = -1
        floorNode.eulerAngles.x = -.pi / 2
        floorNode.position = SCNVector3(0, -0.002, 0)
        scene.rootNode.addChildNode(floorNode)

        // A three-quarter view from the front, a little above, like the reference photo.
        let camera = SCNCamera()
        camera.fieldOfView = 28
        camera.zNear = 6
        camera.zFar = 40
        cameraNode.camera = camera
        let distance = 15.0, elevation = 0.56, yaw = -0.24
        cameraNode.position = SCNVector3(
            CGFloat(distance * cos(elevation) * sin(yaw)),
            CGFloat(distance * sin(elevation)) + 1.5,
            CGFloat(distance * cos(elevation) * cos(yaw))
        )
        scene.rootNode.addChildNode(cameraNode)
        cameraNode.look(at: SCNVector3(0, 1.9, -0.1))
    }

    private func buildBase() {
        let w = L.caseWidth, d = L.caseDepth, bh = L.baseHeight
        caseRoot.addChildNode(at(box(w, bh, d, chamfer: 0.07, leather), 0, bh / 2, 0))

        // Deck plate, inset so a frame of leather shows around it.
        caseRoot.addChildNode(at(box(2 * L.deckHalfWidth, 0.02, 2 * L.deckHalfDepth, deckBlack), 0, bh, 0))
        for sx in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                let screw = cylinder(0.035, 0.012, steel)
                caseRoot.addChildNode(at(screw, sx * (L.deckHalfWidth - 0.09), L.deckHeight + 0.004, sz * (L.deckHalfDepth - 0.09)))
            }
        }

        // Brass corners.
        for sx in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                caseRoot.addChildNode(at(box(0.3, 0.3, 0.3, chamfer: 0.04, brass), sx * (w / 2 - 0.1), 0.15, sz * (d / 2 - 0.1)))
            }
        }
    }

    private func buildLid() {
        let w = L.caseWidth, d = L.caseDepth, lh = L.lidHeight
        // Hinge along the back top edge of the base.
        lidPivot.position = SCNVector3(0, CGFloat(L.baseHeight), CGFloat(-d / 2))
        caseRoot.addChildNode(lidPivot)

        // Box faces: front, right, back, left, top, bottom. The bottom is the lining.
        let shell = SCNBox(width: CGFloat(w), height: CGFloat(lh), length: CGFloat(d), chamferRadius: 0.07)
        shell.materials = [leather, leather, leather, leather, leather, lining]
        lidPivot.addChildNode(at(SCNNode(geometry: shell), 0, lh / 2, d / 2))

        // A leather lip around the lining, so the open lid reads as a tray, not a slab.
        let lip = 0.05, band = 0.12
        lidPivot.addChildNode(at(box(w, lip, band, leather), 0, -lip / 2, d - band / 2))
        lidPivot.addChildNode(at(box(w, lip, band, leather), 0, -lip / 2, band / 2))
        for sx in [-1.0, 1.0] {
            lidPivot.addChildNode(at(box(band, lip, d - 2 * band, leather), sx * (w / 2 - band / 2), -lip / 2, d / 2))
        }

        // Brass corners and the lid half of the clasps.
        for sx in [-1.0, 1.0] {
            for sz in [0.0, 1.0] {
                lidPivot.addChildNode(at(box(0.3, 0.3, 0.3, chamfer: 0.04, brass), sx * (w / 2 - 0.1), lh - 0.15, 0.1 + sz * (d - 0.2)))
            }
            lidPivot.addChildNode(at(box(0.34, 0.2, 0.05, chamfer: 0.01, brass), sx * 0.8, lh * 0.35, d + 0.02))
        }
        lidPivot.addChildNode(at(box(0.3, 0.2, 0.05, chamfer: 0.01, brass), 0, lh * 0.35, d + 0.02))
    }

    private func buildFront() {
        let d = L.caseDepth, bh = L.baseHeight
        let z = d / 2

        // Speaker cloth, in a thin brass frame.
        let grille = SCNMaterial()
        grille.lightingModel = .physicallyBased
        grille.roughness.contents = 0.9
        grille.diffuse.contents = SuitcaseTextures.grille()
        grille.diffuse.wrapS = .repeat
        grille.diffuse.wrapT = .repeat
        grille.diffuse.contentsTransform = SCNMatrix4MakeScale(3, 2, 1)
        for sx in [-1.0, 1.0] {
            caseRoot.addChildNode(at(box(0.9, 0.62, 0.02, brass), sx * 1.5, bh * 0.5, z + 0.004))
            let cloth = SCNPlane(width: 0.82, height: 0.54)
            cloth.materials = [grille]
            caseRoot.addChildNode(at(SCNNode(geometry: cloth), sx * 1.5, bh * 0.5, z + 0.017))
        }

        // Leather handle with a brass clasp on each side, and a small catch in the middle.
        caseRoot.addChildNode(at(box(0.95, 0.24, 0.12, chamfer: 0.05, leather), 0, bh * 0.45, z + 0.06))
        for sx in [-1.0, 1.0] {
            caseRoot.addChildNode(at(box(0.34, 0.26, 0.06, chamfer: 0.012, brass), sx * 0.8, bh * 0.62, z + 0.03))
            caseRoot.addChildNode(at(box(0.22, 0.05, 0.07, chamfer: 0.01, deckBlack), sx * 0.8, bh * 0.62, z + 0.04))
        }
        caseRoot.addChildNode(at(box(0.2, 0.22, 0.05, chamfer: 0.01, brass), 0, bh * 0.86, z + 0.025))
    }

    private func buildRecord() {
        let rc = L.record
        let deckTop = L.deckHeight

        // Platter.
        let platter = cylinder(L.platterRadius, 0.05, SuitcaseScene.pbr(NSColor(white: 0.12, alpha: 1), roughness: 0.4, metalness: 0.8))
        caseRoot.addChildNode(at(platter, rc.x, deckTop + 0.025, rc.z))

        // The record turns about its own centre. Everything on it is a child of `recordSpin`.
        recordSpin.name = SuitcaseControl.record.rawValue
        recordSpin.position = SCNVector3(CGFloat(rc.x), CGFloat(deckTop + 0.06), CGFloat(rc.z))
        caseRoot.addChildNode(recordSpin)

        let vinyl = SuitcaseScene.pbr(NSColor(white: 0.03, alpha: 1), roughness: 0.3, metalness: 0.5)
        recordSpin.addChildNode(cylinder(L.recordRadius, 0.02, vinyl))

        let labelFraction = L.labelRadius / L.recordRadius
        let grooveMaterial = SCNMaterial()
        grooveMaterial.lightingModel = .constant
        grooveMaterial.diffuse.contents = SuitcaseTextures.grooves(labelFraction: CGFloat(labelFraction))
        let grooves = flatPlane(2 * L.recordRadius, 2 * L.recordRadius, grooveMaterial)
        recordSpin.addChildNode(at(grooves, 0, 0.012, 0))

        let label = flatPlane(2 * L.labelRadius, 2 * L.labelRadius, labelMaterial)
        recordSpin.addChildNode(at(label, 0, 0.0145, 0))

        recordSpin.addChildNode(at(cylinder(0.028, 0.045, steel), 0, 0.02, 0))

        // Light sheen that stays put while the record turns under it.
        let sheenMaterial = SCNMaterial()
        sheenMaterial.lightingModel = .constant
        sheenMaterial.blendMode = .add
        sheenMaterial.writesToDepthBuffer = false
        sheenMaterial.diffuse.contents = SuitcaseTextures.sheen(labelFraction: CGFloat(labelFraction))
        let sheen = flatPlane(2 * L.recordRadius, 2 * L.recordRadius, sheenMaterial)
        caseRoot.addChildNode(at(sheen, rc.x, L.recordTop + 0.018, rc.z))
    }

    private func buildTonearm() {
        let pivot = Tonearm.pivot
        let h = 0.2
        tonearmPivot.position = SCNVector3(CGFloat(pivot.x), CGFloat(L.deckHeight + h), CGFloat(pivot.z))
        caseRoot.addChildNode(tonearmPivot)

        let black = SuitcaseScene.pbr(NSColor(white: 0.06, alpha: 1), roughness: 0.4, metalness: 0.5)
        // Base column.
        tonearmPivot.addChildNode(at(cylinder(0.17, h, black), 0, -h / 2, 0))
        tonearmPivot.addChildNode(at(cylinder(0.1, 0.05, steel), 0, 0.02, 0))

        // The arm points along local -x; the pivot's turn aims it at the stylus.
        let tube = cylinder(0.022, Tonearm.length, steel)
        tube.eulerAngles.z = .pi / 2
        tonearmPivot.addChildNode(at(tube, -Tonearm.length / 2, 0, 0))

        // Counterweight at the back, headshell and cartridge at the front.
        let weight = cylinder(0.075, 0.22, black)
        weight.eulerAngles.z = .pi / 2
        tonearmPivot.addChildNode(at(weight, 0.32, 0, 0))
        tonearmPivot.addChildNode(at(box(0.22, 0.035, 0.12, black), -Tonearm.length - 0.04, -0.01, 0))
        let cartridge = SuitcaseScene.pbr(NSColor(srgbRed: 0.8, green: 0.1, blue: 0.1, alpha: 1), roughness: 0.5)
        tonearmPivot.addChildNode(at(box(0.14, 0.09, 0.1, cartridge), -Tonearm.length - 0.04, -0.07, 0))
    }

    private func buildKnob() {
        let k = L.knob
        let deckTop = L.deckHeight

        // Bezel and tick marks stay still; the knob turns inside them.
        caseRoot.addChildNode(at(cylinder(L.knobRadius + 0.04, 0.03, steel), k.x, deckTop + 0.015, k.z))
        let tickMaterial = SuitcaseScene.pbr(NSColor(white: 0.8, alpha: 1), roughness: 0.5)
        let ticks = 11
        for i in 0..<ticks {
            let a = VolumeKnob.minAngle + Double(i) / Double(ticks - 1) * VolumeKnob.sweep
            let r = L.knobRadius + 0.11
            let tick = box(i == 0 || i == ticks - 1 || i == ticks / 2 ? 0.026 : 0.016, 0.006, 0.05, tickMaterial)
            tick.eulerAngles.y = CGFloat(-a)
            caseRoot.addChildNode(at(tick, k.x + r * sin(a), deckTop + 0.004, k.z - r * cos(a)))
        }

        // The knob itself, with a pointer line near its rim.
        knobNode.name = SuitcaseControl.knob.rawValue
        knobNode.position = SCNVector3(CGFloat(k.x), CGFloat(deckTop + 0.12), CGFloat(k.z))
        caseRoot.addChildNode(knobNode)
        let knobMaterial = SuitcaseScene.pbr(NSColor(white: 0.05, alpha: 1), roughness: 0.28, metalness: 0.6)
        knobNode.addChildNode(cylinder(L.knobRadius, 0.18, knobMaterial))
        knobNode.addChildNode(at(cylinder(L.knobRadius - 0.05, 0.012, SuitcaseScene.pbr(NSColor(white: 0.1, alpha: 1), roughness: 0.2, metalness: 0.7)), 0, 0.093, 0))
        let pointer = SuitcaseScene.pbr(NSColor(white: 0.95, alpha: 1), roughness: 0.4)
        knobNode.addChildNode(at(box(0.03, 0.014, 0.15, pointer), 0, 0.1, -(L.knobRadius - 0.13)))

        // A larger invisible target, so the knob is easy to grab.
        let hit = SCNMaterial()
        hit.transparency = 0.001
        hit.writesToDepthBuffer = false
        knobNode.addChildNode(cylinder(L.knobRadius + 0.14, 0.2, hit))
    }

    private func buildButtons() {
        let deckTop = L.deckHeight
        let symbols: [SuitcaseControl: String] = [
            .previous: "backward.fill", .playPause: "play.fill", .next: "forward.fill", .like: "heart",
        ]
        for control in [SuitcaseControl.previous, .playPause, .next, .like] {
            guard let spec = L.button(control), let symbol = symbols[control] else { continue }
            let root = SCNNode()
            root.name = control.rawValue
            root.position = SCNVector3(CGFloat(spec.center.x), CGFloat(deckTop), CGFloat(spec.center.z))
            caseRoot.addChildNode(root)

            // Fixed ring around the button.
            root.addChildNode(at(cylinder(spec.radius + 0.035, 0.03, steel), 0, 0.015, 0))

            // The part that sinks when pressed.
            let cap = SCNNode()
            root.addChildNode(cap)
            let body = SuitcaseScene.pbr(NSColor(white: 0.12, alpha: 1), roughness: 0.3, metalness: 0.5)
            cap.addChildNode(at(cylinder(spec.radius, 0.07, body), 0, 0.04, 0))
            bodyMaterials[control] = body

            let glyphMaterial = SCNMaterial()
            glyphMaterial.lightingModel = .constant
            glyphMaterial.diffuse.contents = glyph(symbol)
            glyphMaterial.writesToDepthBuffer = false
            glyphMaterials[control] = glyphMaterial
            cap.addChildNode(at(flatPlane(2 * spec.radius, 2 * spec.radius, glyphMaterial), 0, 0.0755, 0))
            caps[control] = cap
        }
    }
}

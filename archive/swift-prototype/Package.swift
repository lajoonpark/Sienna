// swift-tools-version: 5.9
import PackageDescription

// SiennaCore is pure Swift (no AppKit), so its tests run on any platform, including Linux.
// The Sienna app target needs AppKit/SceneKit and is only declared on macOS.
var products: [Product] = [
    .library(name: "SiennaCore", targets: ["SiennaCore"]),
]
var targets: [Target] = [
    .target(name: "SiennaCore"),
    .testTarget(name: "SiennaCoreTests", dependencies: ["SiennaCore"]),
]

#if os(macOS)
products.append(.executable(name: "Sienna", targets: ["Sienna"]))
targets.append(.executableTarget(name: "Sienna", dependencies: ["SiennaCore"]))
#endif

let package = Package(
    name: "Sienna",
    platforms: [.macOS(.v14)],
    products: products,
    targets: targets
)

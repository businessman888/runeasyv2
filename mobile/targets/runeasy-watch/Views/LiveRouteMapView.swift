import SwiftUI
import MapKit

struct LiveRouteMapView: View {
    let route: LiveRoutePresentation
    let locationState: LiveRouteLocationState
    let isActivePage: Bool

    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        Group {
            if !isActivePage {
                inactiveContent
            } else if isLuminanceReduced {
                reducedLuminanceContent
            } else {
                locationContent
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.runEasyNavy)
        .privacySensitive()
    }

    @ViewBuilder
    private var locationContent: some View {
        switch locationState {
        case .seeking:
            stateContent(
                icon: RunEasySymbol.location,
                title: "Buscando GPS…",
                detail: "A rota aparece assim que o relógio localizar você.",
                color: .runEasyCyan
            )
        case let .active(accuracy, updatedAt):
            if route.pointCount > 0 {
                routeMap(
                    status: "GPS ±\(Int(accuracy.rounded())) m",
                    detail: relativeUpdateLabel(updatedAt),
                    statusColor: .runEasyCyan
                )
            } else {
                stateContent(
                    icon: RunEasySymbol.location,
                    title: "GPS localizado",
                    detail: "Aguardando o primeiro ponto da rota.",
                    color: .runEasyCyan
                )
            }
        case let .reducedAccuracy(accuracy, updatedAt):
            if route.pointCount > 0 {
                routeMap(
                    status: accuracy.map {
                        "Precisão reduzida ±\(Int($0.rounded())) m"
                    } ?? "Precisão reduzida",
                    detail: updatedAt.map(relativeUpdateLabel) ?? "Aguardando atualização",
                    statusColor: .runEasyWarning
                )
            } else {
                stateContent(
                    icon: "location.slash.fill",
                    title: "Precisão reduzida",
                    detail: "Ative a Localização Precisa para registrar o trajeto.",
                    color: .runEasyWarning
                )
            }
        case .denied:
            stateContent(
                icon: "location.slash.fill",
                title: "Localização desativada",
                detail: "Ative para o RunEasy nos Ajustes do Apple Watch.",
                color: .runEasyWarning
            )
        case .unavailable:
            stateContent(
                icon: "location.slash",
                title: "GPS indisponível",
                detail: "Continue o treino e tente novamente em área aberta.",
                color: .secondary
            )
        case let .paused(accuracy, updatedAt):
            if route.pointCount > 0 {
                routeMap(
                    status: "Rota pausada",
                    detail: pausedDetail(
                        accuracy: accuracy,
                        updatedAt: updatedAt
                    ),
                    statusColor: .runEasyWarning
                )
            } else {
                stateContent(
                    icon: RunEasySymbol.pause,
                    title: "Rota pausada",
                    detail: "Retome o treino para continuar buscando o GPS.",
                    color: .runEasyWarning
                )
            }
        }
    }

    private func routeMap(
        status: String,
        detail: String,
        statusColor: Color
    ) -> some View {
        ZStack(alignment: .topLeading) {
            Map(position: $cameraPosition, interactionModes: []) {
                ForEach(route.segments) { segment in
                    MapPolyline(coordinates: segment.coordinates)
                        .stroke(
                            Color.runEasyCyan,
                            style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round)
                        )
                }

                if let latest = route.latestPoint {
                    Annotation("Posição atual", coordinate: latest.coordinate) {
                        Image(systemName: RunEasySymbol.location)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color.runEasyNavy)
                            .padding(5)
                            .background(Color.runEasyCyan, in: Circle())
                            .accessibilityHidden(true)
                    }
                }
            }
            .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
            .onChange(of: route.revision) {
                updateCamera()
            }
            .onAppear {
                updateCamera()
            }

            VStack(alignment: .leading, spacing: 1) {
                Label(status, systemImage: RunEasySymbol.map)
                    .font(AppFont.labelReadable)
                    .foregroundStyle(statusColor)
                Text(detail)
                    .font(AppFont.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 9))
            .padding(8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Mapa da rota. \(status). \(detail).")
    }

    private func stateContent(
        icon: String,
        title: String,
        detail: String,
        color: Color
    ) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(color)
                .accessibilityHidden(true)
            Text(title)
                .font(AppFont.body)
                .foregroundStyle(.primary)
            Text(detail)
                .font(AppFont.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(16)
        .accessibilityElement(children: .combine)
    }

    private var inactiveContent: some View {
        Color.runEasyNavy
            .accessibilityHidden(true)
    }

    private var reducedLuminanceContent: some View {
        VStack(spacing: 8) {
            Image(systemName: RunEasySymbol.map)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Rota sendo registrada")
                .font(AppFont.bodyMedium)
                .foregroundStyle(.secondary)
            Text("Levante o pulso para ver o mapa.")
                .font(AppFont.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(16)
        .accessibilityElement(children: .combine)
    }

    private func updateCamera() {
        guard isActivePage, let latest = route.latestPoint else { return }
        let region = MKCoordinateRegion(
            center: latest.coordinate,
            latitudinalMeters: 300,
            longitudinalMeters: 300
        )
        cameraPosition = .region(region)
    }

    private func relativeUpdateLabel(_ date: Date) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 5 { return "Atualizado agora" }
        if seconds < 60 { return "Atualizado há \(seconds)s" }
        return "Atualizado há \(seconds / 60)min"
    }

    private func pausedDetail(
        accuracy: Double?,
        updatedAt: Date?
    ) -> String {
        let accuracyLabel = accuracy.map {
            "última precisão ±\(Int($0.rounded())) m"
        }
        let updateLabel = updatedAt.map(relativeUpdateLabel)
        return [accuracyLabel, updateLabel]
            .compactMap { $0 }
            .joined(separator: " • ")
    }
}

private extension LiveRouteSegment {
    var coordinates: [CLLocationCoordinate2D] {
        points.map(\.coordinate)
    }
}

private extension RoutePoint {
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

import SwiftUI
import MapKit

struct LiveRouteMapView: View {
    private enum CameraMode: CaseIterable, Hashable {
        case follow
        case overview
        case explore

        var icon: String {
            switch self {
            case .follow: return "location.fill"
            case .overview: return "arrow.up.left.and.arrow.down.right"
            case .explore: return "hand.draw.fill"
            }
        }

        var accessibilityLabel: String {
            switch self {
            case .follow: return "Acompanhar minha posição"
            case .overview: return "Ver rota completa"
            case .explore: return "Explorar mapa"
            }
        }

        var accessibilityHint: String {
            switch self {
            case .follow: return "Centraliza o mapa na sua posição atual."
            case .overview: return "Ajusta o mapa para mostrar todo o trajeto registrado."
            case .explore: return "Libera arrastar e aproximar o mapa sem recentralização automática."
            }
        }
    }

    let route: LiveRoutePresentation
    let locationState: LiveRouteLocationState
    let isActivePage: Bool

    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @Environment(\.redactionReasons) private var redactionReasons
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var cameraMode: CameraMode = .follow

    private let cameraControlTouchSize: CGFloat = 44

    var body: some View {
        Group {
            if !isActivePage {
                inactiveContent
            } else if isLuminanceReduced || !redactionReasons.isEmpty {
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
            Map(
                position: $cameraPosition,
                interactionModes: cameraMode == .explore ? [.pan, .zoom] : []
            ) {
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
                updateCameraForSelectedMode()
            }
            .onAppear {
                updateCameraForSelectedMode()
            }
            .accessibilityLabel("Mapa da rota. \(status). \(detail).")

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
            .accessibilityElement(children: .combine)

            VStack {
                Spacer(minLength: 0)
                cameraControls
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 4)
        }
        .accessibilityElement(children: .contain)
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

    private var cameraControls: some View {
        HStack(spacing: 2) {
            ForEach(CameraMode.allCases, id: \.self) { mode in
                Button {
                    selectCameraMode(mode)
                } label: {
                    Image(systemName: mode.icon)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(
                            cameraMode == mode ? Color.runEasyNavy : Color.runEasyTextPrimary
                        )
                        .frame(
                            width: cameraControlTouchSize,
                            height: cameraControlTouchSize
                        )
                        .background(
                            cameraMode == mode ? Color.runEasyCyan : Color.black.opacity(0.48),
                            in: Circle()
                        )
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mode.accessibilityLabel)
                .accessibilityHint(mode.accessibilityHint)
                .accessibilityAddTraits(cameraMode == mode ? .isSelected : [])
            }
        }
        .padding(.horizontal, 4)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityElement(children: .contain)
    }

    private func selectCameraMode(_ mode: CameraMode) {
        cameraMode = mode
        updateCameraForSelectedMode()
    }

    /// Atualizações da rota só movem a câmera nos modos automáticos. Em
    /// `explore`, preservar a câmera escolhida pelo corredor evita o snap-back
    /// a cada publicação de GPS (a apresentação é atualizada a cada ~3 s).
    private func updateCameraForSelectedMode() {
        guard isActivePage else { return }
        switch cameraMode {
        case .follow:
            updateFollowCamera()
        case .overview:
            updateOverviewCamera()
        case .explore:
            return
        }
    }

    private func updateFollowCamera() {
        guard let latest = route.latestPoint else { return }
        cameraPosition = .region(
            MKCoordinateRegion(
                center: latest.coordinate,
                latitudinalMeters: 300,
                longitudinalMeters: 300
            )
        )
    }

    private func updateOverviewCamera() {
        let coordinates = route.segments.flatMap(\.coordinates)
        guard let first = coordinates.first else { return }
        guard coordinates.count > 1 else {
            updateFollowCamera()
            return
        }

        var minimumLatitude = first.latitude
        var maximumLatitude = first.latitude
        var minimumLongitude = first.longitude
        var maximumLongitude = first.longitude

        for coordinate in coordinates.dropFirst() {
            minimumLatitude = min(minimumLatitude, coordinate.latitude)
            maximumLatitude = max(maximumLatitude, coordinate.latitude)
            minimumLongitude = min(minimumLongitude, coordinate.longitude)
            maximumLongitude = max(maximumLongitude, coordinate.longitude)
        }

        let center = CLLocationCoordinate2D(
            latitude: (minimumLatitude + maximumLatitude) / 2,
            longitude: (minimumLongitude + maximumLongitude) / 2
        )
        // Aproximadamente 300 m de abertura mínima. Isso mantém rotas curtas
        // legíveis e acrescenta 35% de respiro às rotas maiores.
        let minimumLatitudeDelta = 300 / 111_000.0
        let latitudeCosine = max(abs(cos(center.latitude * .pi / 180)), 0.2)
        let minimumLongitudeDelta = minimumLatitudeDelta / latitudeCosine
        let span = MKCoordinateSpan(
            latitudeDelta: max((maximumLatitude - minimumLatitude) * 1.35, minimumLatitudeDelta),
            longitudeDelta: max((maximumLongitude - minimumLongitude) * 1.35, minimumLongitudeDelta)
        )
        cameraPosition = .region(MKCoordinateRegion(center: center, span: span))
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

#Preview("Mapa ativo") {
    LiveRouteMapView(
        route: .empty,
        locationState: .seeking,
        isActivePage: true
    )
}

#Preview("Mapa Always On") {
    LiveRouteMapView(
        route: .empty,
        locationState: .seeking,
        isActivePage: true
    )
    .redacted(reason: .placeholder)
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

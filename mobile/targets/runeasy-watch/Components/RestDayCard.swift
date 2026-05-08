import SwiftUI

/// Card de dia de descanso ("Recuperação Ativa") matching Figma node 1112-1264.
/// Mirror visual da home do app mobile (recoveryCard).
///
/// Mostra:
///   - Título "Recuperação Ativa" em roxo
///   - Descrição motivacional
///   - Timer ao vivo "HH : MM : SS" (tempo restante até meia-noite)
///   - Progress bar (% do dia concluído)
///   - Footer com próximo treino
struct RestDayCard: View {
    let nextWorkout: NextWorkoutInfo?

    @State private var now: Date = Date()
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var timeRemainingComponents: (h: Int, m: Int, s: Int) {
        let cal = Calendar.current
        let endOfDay = cal.date(bySettingHour: 23, minute: 59, second: 59, of: now) ?? now
        let interval = max(0, endOfDay.timeIntervalSince(now))
        let h = Int(interval) / 3600
        let m = (Int(interval) % 3600) / 60
        let s = Int(interval) % 60
        return (h, m, s)
    }

    private var dayProgress: Double {
        let cal = Calendar.current
        let startOfDay = cal.startOfDay(for: now)
        let secondsPassed = now.timeIntervalSince(startOfDay)
        return min(1.0, max(0.0, secondsPassed / (24 * 3600)))
    }

    private var formattedNextWorkoutDate: String {
        guard let next = nextWorkout else { return "" }
        guard let d = parseISODate(next.date) else { return next.date }
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "EEEE, d 'de' MMM"
        return f.string(from: d).capitalized(with: f.locale)
    }

    private func parseISODate(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/Sao_Paulo")
        return f.date(from: iso)
    }

    var body: some View {
        VStack(spacing: 6) {
            header
            timer
            progressBar
            if nextWorkout != nil {
                nextWorkoutPill
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyCardBg)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.runEasyPurple, lineWidth: 1.0)
        )
        .neonGlow(color: .runEasyPurple, radius: 5, opacity: 0.20)
        .onReceive(ticker) { now = $0 }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Recuperação Ativa")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.runEasyPurple)
            Text("Seu corpo está se recuperando.")
                .font(.system(size: 9, weight: .regular))
                .foregroundColor(.runEasyText60)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var timer: some View {
        let comps = timeRemainingComponents
        return VStack(spacing: 0) {
            Text("Tempo restante hoje")
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(.runEasyText60)
            HStack(spacing: 1) {
                Text(String(format: "%02d", comps.h))
                Text(":")
                Text(String(format: "%02d", comps.m))
                Text(":")
                Text(String(format: "%02d", comps.s))
            }
            .font(.system(size: 18, weight: .bold, design: .rounded))
            .foregroundColor(.runEasyPurple)
            .monospacedDigit()
            HStack(spacing: 14) {
                Text("horas").font(.system(size: 7))
                Text("min").font(.system(size: 7))
                Text("seg").font(.system(size: 7))
            }
            .foregroundColor(.runEasyText60)
            .padding(.top, 1)
        }
        .frame(maxWidth: .infinity)
    }

    private var progressBar: some View {
        VStack(spacing: 2) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.runEasyPurple.opacity(0.15))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.runEasyPurple)
                        .frame(width: geo.size.width * dayProgress, height: 4)
                }
            }
            .frame(height: 4)
            Text("\(Int(dayProgress * 100))% do dia concluído")
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(.runEasyText60)
        }
    }

    private var nextWorkoutPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "calendar")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.runEasyText60)
            Text("Próximo: \(nextWorkout?.title ?? "—") - \(formattedNextWorkoutDate)")
                .font(.system(size: 8, weight: .regular))
                .foregroundColor(.runEasyText60)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyNavy)
        .cornerRadius(6)
    }
}

#Preview {
    RestDayCard(nextWorkout: .mock)
        .padding()
        .background(Color.runEasyNavy)
}

#Preview("Sem próximo treino") {
    RestDayCard(nextWorkout: nil)
        .padding()
        .background(Color.runEasyNavy)
}

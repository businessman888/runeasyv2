import SwiftUI

/// Card compacto de atividade avulsa (corrida livre / treino manual).
/// Espelha os cards da aba "Atividades" da Home do app mobile, reduzido ao que
/// cabe numa linha de relógio.
struct ActivityCard: View {
    let activity: ActivityForWatch

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Image(systemName: activity.source.icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.runEasyCyan)
                Text(activity.title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.runEasyTextPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 2)
                if activity.isCompleted {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.runEasySuccess)
                }
            }
            Text(activity.summaryLine)
                .font(.system(size: 9, weight: .regular, design: .rounded))
                .foregroundColor(.runEasyText60)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.runEasyCardBg)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(
                    activity.isCompleted
                        ? Color.runEasySuccess.opacity(0.35)
                        : Color.runEasyBorder,
                    lineWidth: 1
                )
        )
    }
}

#Preview {
    VStack(spacing: 8) {
        ActivityCard(activity: .mockFree)
        ActivityCard(activity: .mockManual)
    }
    .padding()
    .background(Color.runEasyNavy)
}

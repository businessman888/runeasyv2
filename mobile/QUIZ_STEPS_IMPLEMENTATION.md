# QUIZ_STEPS Array Implementation

## Componentes Refatorados (5)

Os seguintes componentes foram refatorados com sucesso para o padrão de componentes puros, aceitando `value` e `onChange` props:

1. **ObjectiveScreen.tsx** - Seleção de objetivo (objetivo de corrida)
2. **LevelScreen.tsx** - Seleção de nível de experiência  
3. **FrequencyScreen.tsx** - Frequência de treinos por semana (slider 2-7 dias)
4. **PaceScreen.tsx** - Limitações/lesões físicas (hasInjury + injuryDetails)
5. **TimeframeScreen.tsx** - Pace atual (ritmo médio em min:sec/km)

## Componentes NÃO Refatorados (4)

Estes componentes mantêm navegação própria pois são telas de transição/apresentação:

- **LimitationsScreen.tsx** - Usa QuizLayout, submete dados ao backend
- **PlanLoadingScreen.tsx** - Tela de loading com animação, chama `submitOnboarding()`
- **PlanPreviewScreen.tsx** - Preview do plano (ainda tem QuizProgressBar)
- **SmartPlanScreen.tsx** - Apresentação final do plano

## QUIZ_STEPS Array

```typescript
// QuizOnboardingScreen.tsx
import { ObjectiveScreen } from './ObjectiveScreen';
import { LevelScreen } from './LevelScreen';
import { FrequencyScreen } from './FrequencyScreen';
import { PaceScreen } from './PaceScreen';
import { TimeframeScreen } from './TimeframeScreen';

const QUIZ_STEPS = [
  {
    id: 'objective',
    component: ObjectiveScreen,
    dataKey: 'goal',
    title: 'Qual é o seu objetivo?',
  },
  {
    id: 'level',
    component: LevelScreen,
    dataKey: 'experience_level',
    title: 'Qual é o seu nível?',
  },
  {
    id: 'frequency',
    component: FrequencyScreen,
    dataKey: 'daysPerWeek',
    title: 'Quantos dias por semana?',
  },
  {
    id: 'pace',
    component: PaceScreen,
    dataKeys: ['hasInjury', 'injuryDetails'], // Multiple keys for this step
    title: 'Limitações físicas?',
  },
  {
    id: 'timeframe',
    component: TimeframeScreen,
    dataKeys: ['paceMinutes', 'paceSeconds', 'dontKnowPace'], // Multiple keys
    title: 'Qual é o seu Pace?',
  },
];
```

## Estrutura do formData (onboardingStore)

```typescript
interface FormData {
  // Step 1: Objective
  goal: string | null;
  
  // Step 2: Level
  experience_level: string | null;
  
  // Step 3: Frequency
  daysPerWeek: number;
  
  // Step 4: Pace (Limitations)
  hasInjury: boolean;
  injuryDetails: string;
  
  // Step 5: Timeframe (Pace)
  paceMinutes: string;
  paceSeconds: string;
  dontKnowPace: boolean;
}
```

## Passos de Integração

### 1. QuizOnboardingScreen Container

```typescript
export function QuizOnboardingScreen({ navigation, route }: any) {
  const { data, updateData } = useOnboardingStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Reset scroll on step change
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < QUIZ_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Navigate to PlanLoadingScreen
      navigation.navigate('Quiz_PlanLoading', { userId });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const CurrentStepComponent = QUIZ_STEPS[currentStep].component;
  const stepConfig = QUIZ_STEPS[currentStep];

  // Handle onChange for multi-key steps
  const handleChange = (value: any) => {
    if (Array.isArray(stepConfig.dataKeys)) {
      updateData(value); // value is an object with multiple keys
    } else {
      updateData({ [stepConfig.dataKey]: value });
    }
  };

  // Get value(s) for current step
  const getValue = () => {
    if (Array.isArray(stepConfig.dataKeys)) {
      // Return object with all keys for this step
      return stepConfig.dataKeys.reduce((acc, key) => ({
        ...acc,
        [key]: data[key],
      }), {});
    }
    return data[stepConfig.dataKey];
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Fixed Progress Bar */}
      <QuizProgressBar currentStep={currentStep + 1} totalSteps={QUIZ_STEPS.length} />
      
      {/* Scrollable Content */}
      <ScrollView ref={scrollViewRef} style={styles.scrollView}>
        <View style={styles.content}>
          <CurrentStepComponent
            value={getValue()}
            onChange={handleChange}
            {...(Array.isArray(stepConfig.dataKeys) ? getValue() : {})}
          />
        </View>
      </ScrollView>
      
      {/* Fixed Navigation Buttons */}
      <FixedNavigationButtons
        onNext={handleNext}
        onBack={handleBack}
        canGoNext={/* validation logic */}
        showBack={currentStep > 0}
      />
    </View>
  );
}
```

### 2. Navegação Atualizada

Após o último step (Timeframe), navega para:
```typescript
navigation.navigate('Quiz_PlanLoading', { userId });
```

O `PlanLoadingScreen` então:
1. Chama `submitOnboarding()`
2. Mostra animação de loading
3. Navega para `SmartPlan` com o planData

## Status Atual

✅ 5 componentes refatorados
⚠️  Precisa criar QuizOnboardingScreen container
⚠️  Precisa atualizar navegação stack
⚠️  Precisa implementar FixedNavigationButtons
⚠️  Precisa validar fluxo completo

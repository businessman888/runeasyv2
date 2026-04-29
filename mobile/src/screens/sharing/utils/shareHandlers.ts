import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import Share, { Social } from 'react-native-share';

const STORIES_BG_TOP = '#070b14';
const STORIES_BG_BOTTOM = '#003d5c';

async function readBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
}

function getFacebookAppId(): string {
  return (Constants.expoConfig?.extra as { facebookAppId?: string } | undefined)?.facebookAppId ?? '';
}

export async function shareToInstagramStories(uri: string): Promise<void> {
  try {
    const base64 = await readBase64(uri);
    const appId = getFacebookAppId();

    await Share.shareSingle({
      stickerImage: `data:image/png;base64,${base64}`,
      backgroundTopColor: STORIES_BG_TOP,
      backgroundBottomColor: STORIES_BG_BOTTOM,
      social: Social.InstagramStories,
      appId: appId || undefined,
    } as any);
  } catch (err: any) {
    const message = String(err?.message ?? '');
    if (message.includes('not installed') || message.includes('User did not share')) {
      return;
    }
    if (message.includes('appId') || message.includes('App Id')) {
      Alert.alert(
        'Configuração pendente',
        'Compartilhamento direto para Stories requer um Facebook App ID. Use "Mais" como alternativa.',
      );
      return;
    }
    await openSystemShareSheet(uri);
  }
}

export async function copyImageToClipboard(uri: string): Promise<void> {
  try {
    const base64 = await readBase64(uri);
    await Clipboard.setImageAsync(base64);
    Alert.alert('Copiado!', 'Imagem copiada para a área de transferência.');
  } catch {
    Alert.alert('Erro', 'Falha ao copiar imagem.');
  }
}

export async function downloadImageToGallery(uri: string): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para salvar a imagem.');
      return;
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('Salvo!', 'Imagem salva na galeria.');
  } catch {
    Alert.alert('Erro', 'Falha ao salvar imagem.');
  }
}

export async function openSystemShareSheet(uri: string): Promise<void> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Indisponível', 'Compartilhamento não disponível neste dispositivo.');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Compartilhar treino',
    });
  } catch {
    Alert.alert('Erro', 'Falha ao abrir compartilhamento.');
  }
}

export const __testables = { Platform };

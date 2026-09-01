export const audioRecordingMimeCandidates = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function baseMimeType(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'audio/x-m4a') return 'audio/mp4';
  if (normalized === 'audio/x-wav') return 'audio/wav';
  return normalized;
}

export function preferredAudioRecordingMime(isTypeSupported: (type: string) => boolean) {
  return audioRecordingMimeCandidates.find((type) => {
    try { return isTypeSupported(type); } catch { return false; }
  }) || '';
}

export function audioFilenameExtension(mimeType: unknown) {
  const normalized = baseMimeType(mimeType);
  if (normalized === 'audio/mp4') return 'm4a';
  if (normalized === 'audio/ogg') return 'ogg';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav') return 'wav';
  return 'webm';
}

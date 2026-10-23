// Imagem opcional de conta/cartão (Supabase Storage, bucket privado).
// Puramente visual: nunca define tipo, moeda ou qualquer regra financeira.
// Caminho no bucket: <owner_id>/<account_id>/<arquivo>. A primeira pasta é o
// dono (políticas do Storage) e a segunda, a conta (restrição em accounts).

export const ACCOUNT_IMAGE_BUCKET = "account-images";
export const ACCOUNT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const ACCOUNT_IMAGE_HINT = "PNG, JPEG ou WebP, até 2 MB.";

export const ACCOUNT_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type AccountImageType = keyof typeof ACCOUNT_IMAGE_TYPES;

/** Tipo real pelo conteúdo (assinatura do arquivo), não pela extensão. */
export function detectAccountImageType(bytes: Uint8Array): AccountImageType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

export type AccountImageValidation =
  | { ok: true; type: AccountImageType; extension: string }
  | { ok: false; message: string };

export function validateAccountImage(file: {
  type: string;
  size: number;
  /** Primeiros bytes do arquivo (12 bastam). */
  header: Uint8Array;
}): AccountImageValidation {
  if (!(file.type in ACCOUNT_IMAGE_TYPES)) {
    return { ok: false, message: `Formato não aceito. Use ${ACCOUNT_IMAGE_HINT}` };
  }
  if (file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio." };
  }
  if (file.size > ACCOUNT_IMAGE_MAX_BYTES) {
    return { ok: false, message: "A imagem passa de 2 MB. Escolha um arquivo menor." };
  }
  const detected = detectAccountImageType(file.header);
  if (detected !== file.type) {
    return { ok: false, message: `O conteúdo do arquivo não é uma imagem válida. Use ${ACCOUNT_IMAGE_HINT}` };
  }
  return { ok: true, type: detected, extension: ACCOUNT_IMAGE_TYPES[detected] };
}

/** Novo arquivo a cada envio: a imagem anterior só sai depois do cadastro salvo. */
export function buildAccountImagePath(
  ownerId: string,
  accountId: string,
  extension: string,
  uniqueId: string,
) {
  return `${ownerId}/${accountId}/${uniqueId}.${extension}`;
}

const SEGMENT = "[0-9a-fA-F-]{1,64}";
const FILE = "[A-Za-z0-9._-]{1,80}\\.(png|jpg|webp)";

/** O caminho pertence a este usuário (e, se informada, a esta conta). */
export function isAccountImagePathOwnedBy(
  path: string | null | undefined,
  ownerId: string,
  accountId?: string,
) {
  if (!path) return false;
  const match = new RegExp(`^(${SEGMENT})/(${SEGMENT})/${FILE}$`).exec(path);
  if (!match) return false;
  return match[1] === ownerId && (accountId === undefined || match[2] === accountId);
}

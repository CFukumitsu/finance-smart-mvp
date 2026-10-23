import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_IMAGE_MAX_BYTES,
  buildAccountImagePath,
  detectAccountImageType,
  isAccountImagePathOwnedBy,
  validateAccountImage,
  // @ts-expect-error Node's native TypeScript test runner requires the extension.
} from "./accountImage.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const SVG = new TextEncoder().encode("<svg xmlns=");
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("detecta PNG, JPEG e WebP pelo conteúdo", () => {
  assert.equal(detectAccountImageType(PNG), "image/png");
  assert.equal(detectAccountImageType(JPEG), "image/jpeg");
  assert.equal(detectAccountImageType(WEBP), "image/webp");
  assert.equal(detectAccountImageType(SVG), null);
});

test("aceita tipos permitidos até 2 MB", () => {
  assert.deepEqual(validateAccountImage({ type: "image/png", size: 1000, header: PNG }), {
    ok: true, type: "image/png", extension: "png",
  });
  assert.equal(validateAccountImage({ type: "image/jpeg", size: ACCOUNT_IMAGE_MAX_BYTES, header: JPEG }).ok, true);
  assert.equal(validateAccountImage({ type: "image/webp", size: 10, header: WEBP }).ok, true);
});

test("rejeita formato, tamanho e conteúdo inválidos", () => {
  assert.equal(validateAccountImage({ type: "image/svg+xml", size: 100, header: SVG }).ok, false);
  assert.equal(validateAccountImage({ type: "image/gif", size: 100, header: PNG }).ok, false);
  assert.equal(validateAccountImage({ type: "image/png", size: ACCOUNT_IMAGE_MAX_BYTES + 1, header: PNG }).ok, false);
  assert.equal(validateAccountImage({ type: "image/png", size: 0, header: PNG }).ok, false);
  // Extensão/tipo declarado de PNG com conteúdo SVG/HTML.
  assert.equal(validateAccountImage({ type: "image/png", size: 100, header: SVG }).ok, false);
  assert.equal(validateAccountImage({ type: "image/jpeg", size: 100, header: PNG }).ok, false);
});

test("caminho fica na pasta do dono e da conta", () => {
  const path = buildAccountImagePath(OWNER, ACCOUNT, "png", "f0e1d2c3-0000-4000-8000-000000000001");
  assert.equal(path, `${OWNER}/${ACCOUNT}/f0e1d2c3-0000-4000-8000-000000000001.png`);
  assert.equal(isAccountImagePathOwnedBy(path, OWNER, ACCOUNT), true);
  assert.equal(isAccountImagePathOwnedBy(path, OWNER), true);
  assert.equal(isAccountImagePathOwnedBy(path, OTHER), false);
  assert.equal(isAccountImagePathOwnedBy(path, OWNER, OTHER), false);
  assert.equal(isAccountImagePathOwnedBy(`${OWNER}/../${OTHER}/x.png`, OWNER), false);
  assert.equal(isAccountImagePathOwnedBy(`${OWNER}/${ACCOUNT}/x.svg`, OWNER), false);
  assert.equal(isAccountImagePathOwnedBy(null, OWNER), false);
});

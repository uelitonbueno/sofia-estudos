export function shouldOfferVideoUpload(errorMessage: string) {
  return /legendas públicas/i.test(errorMessage);
}

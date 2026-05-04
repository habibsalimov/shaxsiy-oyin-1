const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function getHostDocumentKind(file) {
  const name = file?.name || "";
  const type = file?.type || "";

  if (type === DOCX_MIME || /\.docx$/i.test(name)) return "docx";
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  if (type === "application/pdf" || type === "text/plain" || type === "text/html" || /\.(pdf|txt|html?)$/i.test(name)) return "frame";

  return "unsupported";
}

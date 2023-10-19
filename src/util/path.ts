export default function getPath(url: string) {
  const rawPath = new URL(url).pathname.slice(1);
  return rawPath[rawPath.length - 1] === "/" ? rawPath.slice(0, rawPath.length - 1) : rawPath;
}

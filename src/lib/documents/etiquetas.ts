/**
 * Etiquetas que se muestran junto a la categoría de un documento.
 *
 * Un documento puede llevar una etiqueta con el mismo texto que su categoría
 * (el seed de demo lo hacía con todas); mostrarla otra vez al lado del badge se
 * lee como un dato duplicado. La comparación ignora mayúsculas y espacios.
 */
export function etiquetasVisibles(etiquetas: readonly string[], categoria: string): string[] {
  const normalizar = (value: string) => value.trim().toLocaleLowerCase("es");
  const categoriaNormalizada = normalizar(categoria);
  return etiquetas.filter((tag) => normalizar(tag) !== categoriaNormalizada);
}

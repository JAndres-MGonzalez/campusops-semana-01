/**
 * Sustituto de AsyncStorage para Jest (Semana 8).
 *
 * Sin módulo nativo, el adaptador real responde
 * "AsyncStorageError: Native module is null" y los casos del núcleo fallaban
 * antes de ejecutarse. El paquete publica un mock en memoria en su export
 * "./jest"; se registra aquí, antes de que los tests importen el adaptador.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

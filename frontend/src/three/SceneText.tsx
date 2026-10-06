import { forwardRef } from 'react';
import { Text as DreiText } from '@react-three/drei';

/**
 * Texto 3D com fonte LOCAL.
 *
 * O <Text> do drei baixa a Roboto do fonts.gstatic.com por padrão: numa
 * máquina offline (ou com a rede bloqueada) os letreiros do escritório ficavam
 * em branco/cinza até estourar o timeout. Aqui a fonte vem de
 * `public/fonts/axe-sans.woff`, então a cena nunca depende da internet.
 */
export const FONT = '/fonts/axe-sans.woff';
export const FONT_BOLD = '/fonts/axe-sans-bold.woff';

type Props = React.ComponentProps<typeof DreiText> & { bold?: boolean };

export const Text = forwardRef<any, Props>(function Text({ bold, font, ...rest }, ref) {
  return <DreiText ref={ref} font={font ?? (bold ? FONT_BOLD : FONT)} {...rest} />;
});

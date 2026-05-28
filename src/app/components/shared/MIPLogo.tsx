import { ImgHTMLAttributes } from 'react';
import mipLogo from './mip_logo.png';

interface MIPLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  // Allow SVGSVGElement properties to be passed through gracefully to prevent type errors
  // since callers might still pass SVG-specific className or props.
  fill?: string;
  fillRule?: string;
}

export default function MIPLogo({ className, fill, fillRule, ...props }: MIPLogoProps) {
  return (
    <img
      src={mipLogo}
      alt="MIP Logo"
      className={className}
      style={{ display: 'block', maxHeight: '100%', objectFit: 'contain', ...props.style }}
      {...props}
    />
  );
}

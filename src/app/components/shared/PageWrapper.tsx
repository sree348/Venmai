import { ReactNode } from 'react';
import { motion } from 'motion/react';

export default function PageWrapper({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className={`space-y-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

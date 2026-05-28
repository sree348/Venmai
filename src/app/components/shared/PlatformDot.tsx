export default function PlatformDot({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors: any = { Meta: 'bg-blue-500', Google: 'bg-emerald-500', LinkedIn: 'bg-indigo-500', TikTok: 'bg-pink-500' };
  const sz: any = { sm: 'w-2 h-2', md: 'w-2.5 h-2.5', lg: 'w-3 h-3' };
  return <span className={`${sz[size]} rounded-full flex-shrink-0 ${colors[platform] || 'bg-slate-400'}`}></span>;
}

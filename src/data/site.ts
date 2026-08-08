export const site = {
  name: 'All ABoard VA',
  title: 'All ABoard VA - Wine Tours & Charcuterie',
  description:
    'Curated Virginia wine tours and handcrafted charcuterie boards for everyday gatherings and extraordinary celebrations.',
  email: 'info.allaboardva@gmail.com',
  phoneDisplay: '714-715-9836',
  phoneHref: 'tel:+17147159836',
  address: '5877 Washington Boulevard #50001, Arlington, VA 22205',
  nav: [
    { href: '/experiences', label: 'Experiences' },
    { href: '/charcuterie', label: 'Charcuterie' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ],
  social: [
    { href: 'https://www.tiktok.com/@allaboardva', label: 'TikTok' },
    { href: 'https://instagram.com/allaboardva', label: 'Instagram' },
    { href: 'https://facebook.com/AllABoardVA', label: 'Facebook' },
  ],
} as const;

export const legacySiteUrl =
  import.meta.env.PUBLIC_LEGACY_SITE_URL || 'https://www.allaboardva.com';

export function legacyUrl(path: string) {
  return new URL(path, legacySiteUrl).toString();
}

export const featuredBoards = [
  {
    name: 'Great American Graze',
    image: '/images/board-american.webp',
    href: '/charcuterie-menu/p/great-american-graze',
  },
  {
    name: 'Bright & Bold',
    image: '/images/board-bright-bold.webp',
    href: '/charcuterie-menu/p/bright-bold',
  },
  {
    name: 'Meadow & Mediterranean',
    image: '/images/board-mediterranean.webp',
    href: '/charcuterie-menu/p/meadow-mediterranean',
  },
  {
    name: 'Touch of Gold',
    image: '/images/board-gold.webp',
    href: '/charcuterie-menu/p/touch-of-gold',
  },
  {
    name: 'Bright & Lovely Brunch Board',
    image: '/images/board-brunch.webp',
    href: '/charcuterie-menu/p/bright-and-lovely-brunch-board',
  },
  {
    name: 'Holy Smoke',
    image: '/images/board-holy-smoke.webp',
    href: '/charcuterie-menu/p/holy-smoke',
  },
  {
    name: 'Plant-Based Perfection',
    image: '/images/board-plant-based.webp',
    href: '/charcuterie-menu/p/plant-based-perfection',
  },
] as const;

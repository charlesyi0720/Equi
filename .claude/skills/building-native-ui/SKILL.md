# building-native-ui

Guidelines for building native-feeling UI components with smooth animations and interactions.

## Core Principles

1. **Performance First** - 60fps animations, optimized renders
2. **Native Feel** - Platform-appropriate interactions
3. **Accessibility** - Keyboard nav, screen readers, ARIA
4. **Responsive** - Mobile-first, touch-friendly

## Animation Best Practices

### Framer Motion (React)

```tsx
import { motion } from 'framer-motion';

// Smooth fade in
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  Content
</motion.div>

// Stagger children
<motion.ul variants={{
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}}>
  {items.map(item => (
    <motion.li
      key={item.id}
      variants={{
        hidden: { opacity: 0, x: -20 },
        show: { opacity: 1, x: 0 }
      }}
    />
  ))}
</motion.ul>
```

### CSS Transitions

```css
/* Smooth property changes */
.button {
  transition: all 0.2s ease-out;
}

/* Hardware-accelerated transforms */
.card {
  transform: translateZ(0);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.card:hover {
  transform: translateY(-4px) translateZ(0);
}
```

## Touch Interactions

```tsx
// Mobile-friendly tap targets (min 44x44px)
<button className="min-h-[44px] min-w-[44px] p-3">
  Tap Me
</button>

// Prevent double-tap zoom
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />

// Touch feedback
<button className="active:scale-95 transition-transform">
  Press Me
</button>
```

## Smooth Scrolling

```tsx
// Smooth scroll to element
const scrollToSection = () => {
  document.getElementById('section')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
};

// Intersection Observer for scroll animations
const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

<motion.div
  ref={ref}
  initial={{ opacity: 0 }}
  animate={inView ? { opacity: 1 } : {}}
/>
```

## Loading States

```tsx
// Skeleton screens (better than spinners)
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-gray-200 rounded w-3/4" />
  <div className="h-4 bg-gray-200 rounded w-1/2" />
</div>

// Optimistic UI updates
const handleLike = async () => {
  setLiked(true); // Update UI immediately
  try {
    await api.like(postId);
  } catch {
    setLiked(false); // Rollback on error
  }
};
```

## Micro-interactions

```tsx
// Button with ripple effect
<button className="relative overflow-hidden group">
  <span className="relative z-10">Click</span>
  <span className="absolute inset-0 bg-white/20 scale-0 group-active:scale-100 transition-transform origin-center rounded-full" />
</button>

// Input focus states
<input className="
  border-2 border-gray-300
  focus:border-blue-500 focus:ring-4 focus:ring-blue-100
  transition-all duration-200
" />
```

## Performance Tips

1. **Use CSS transforms** (not top/left)
2. **Debounce scroll/resize handlers**
3. **Lazy load images** with `loading="lazy"`
4. **Virtual scrolling** for long lists
5. **Memoize expensive components**

```tsx
// Virtual scrolling example
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});
```

## Accessibility

```tsx
// Keyboard navigation
<button
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  aria-label="Close dialog"
>
  <CloseIcon />
</button>

// Focus management
const dialogRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (isOpen) {
    dialogRef.current?.focus();
  }
}, [isOpen]);

<dialog ref={dialogRef} tabIndex={-1}>
  Content
</dialog>
```

## Native Patterns

### iOS-style Pull to Refresh
```tsx
const [pullDistance, setPullDistance] = useState(0);

<motion.div
  drag="y"
  dragConstraints={{ top: 0, bottom: 100 }}
  onDrag={(_, info) => setPullDistance(info.offset.y)}
  onDragEnd={() => {
    if (pullDistance > 80) refresh();
    setPullDistance(0);
  }}
/>
```

### Android-style FAB
```tsx
<motion.button
  className="fixed bottom-6 right-6 rounded-full shadow-lg"
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.9 }}
>
  <PlusIcon />
</motion.button>
```

## Resources

- [Framer Motion](https://www.framer.com/motion/)
- [React Spring](https://www.react-spring.dev/)
- [GSAP](https://greensock.com/gsap/)

# Frontend Developer Guide

This guide is for developers looking to extend or maintain the **AION Yield** dashboard. The application is built with **Next.js 14**, **Tailwind CSS**, and **Wagmi/AppKit** for Web3 interactions.

## 🎨 Design System & UI Components

AION Yield uses a custom-built, premium component library located in `src/components/ui/`.

### Key Components:
- **`MagicCard`**: A glassmorphic card with subtle hover effects and borders.
- **`TokenIcon`**: Standardized way to display asset icons using SVGs.
- **`StatCard`**: Used across the dashboard and markets page to show high-level metrics.
- **`Badge`**: Status indicators (Active, Slashed, Verified) with theme-aware colors.

---

## 🌓 Theme Engine
The application supports Light and Dark modes using `next-themes`.

### Best Practices:
- Use CSS variables for colors (e.g., `var(--color-primary)`, `var(--color-bg)`).
- Use the `useTheme` hook from `next-themes` for conditional logic in TypeScript.
- **Brand Color**: `#0EA7CB` (Cyan Blue). Avoid using plain purple or generic blues.

---

## ⛓️ Web3 Integration
We use **Wagmi** and **@reown/appkit** for a seamless wallet experience.

### Hooks:
- **`useContractAddresses`**: Custom hook to retrieve the current environment's contract deployments.
- **`useAccount`**: For user wallet status.
- **`useReadContract` / `useWriteContract`**: Standard Wagmi hooks for interacting with the protocol.

### Contracts:
Contract ABIs are stored in `src/lib/abi/abi.json`. Address mappings are managed in `src/hooks/useContracts.ts`.

---

## 🚀 Development Workflow
1. **Install Dependencies**: `npm install`
2. **Environment Variables**: Copy `.env.example` to `.env.local` and add your `NEXT_PUBLIC_REOWN_PROJECT_ID`.
3. **Run Dev**: `npm run dev`
4. **Build**: `npm run build`

'use client'

import React from 'react'

interface TokenIconProps {
  symbol: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

const tokenLogoMap: Record<string, string> = {
  ETH: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=040',
  USDC: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=040',
  DAI: 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.svg?v=040',
  USDT: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=040',
  WBTC: 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.svg?v=040',
  LINK: 'https://cryptologos.cc/logos/chainlink-link-logo.svg?v=040',
  BASE: 'https://mint.base.org/logo.svg', // Base network logo if needed
}

export function TokenIcon({ symbol, size = 32, className, style }: TokenIconProps) {
  const logoUrl = tokenLogoMap[symbol.toUpperCase()]

  if (!logoUrl) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--color-primary-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.4,
          fontWeight: 700,
          color: 'var(--color-primary)',
          ...style,
        }}
      >
        {symbol.slice(0, 1)}
      </div>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={symbol}
      className={className}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        ...style,
      }}
    />
  )
}

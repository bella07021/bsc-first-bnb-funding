export type CexLabel = {
  exchange: string;
  label: string;
};

// BSC exchange hot-wallet labels verified against public BscScan name tags.
// Exact-address matching only: an unknown address is never guessed as a CEX.
const labels: Record<string, CexLabel> = {
  '0x631fc1ea2270e98fbd9d92658ece0f5a269aa161': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet',
  },
  '0xeb2d2f1b8c558a40207669291fda468e50c8a0bb': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 10',
  },
  '0x161ba15a5f335c9f06bb5bbb0a9ce14076fbb645': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 11',
  },
  '0x515b72ed8a97f42c568d6a143232775018f133c8': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 12',
  },
  '0xbd612a3f30dca67bf60a39fd0d35e39b7ab80774': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 13',
  },
  '0xa180fe01b906a1be37be6c534a3300785b20d947': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 16',
  },
  '0x8894e0a0c962cb723c1976a4421c95949be2d4e3': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 6',
  },
  '0xe2fc31f816a9b94326492132018c3aecc4a93ae1': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 7',
  },
  '0x3c783c21a0383057d128bae431894a5c19f9cf06': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 8',
  },
  '0x29bdfbf7d27462a2d115748ace2bd71a2646946c': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 17',
  },
  '0x73f5ebe90f27b46ea12e5795d16c4b408b19cc6f': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 18',
  },
  '0x1fbe2acee135d991592f167ac371f3dd893a508b': {
    exchange: 'Binance',
    label: 'Binance: Hot Wallet 19',
  },
  '0x4982085c9e2f89f2ecb8131eca71afad896e89cb': {
    exchange: 'MEXC',
    label: 'MEXC 13',
  },
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': {
    exchange: 'Bybit',
    label: 'Bybit: Hot Wallet',
  },
  '0x18e296053cbdf986196903e889b7dca7a73882f6': {
    exchange: 'Bybit',
    label: 'Bybit: Hot Wallet 5',
  },
  '0x7c0629bbbaf7d68ffaa393e3fedc9b633679fa5f': {
    exchange: 'OKX',
    label: 'OKX: Hot Wallet',
  },
  '0x97b9d2102a9a65a26e1ee82d59e42d1b73b68689': {
    exchange: 'Bitget',
    label: 'Bitget 3',
  },
  '0x149ded7438caf5e5bfdc507a6c25436214d445e1': {
    exchange: 'Bitget',
    label: 'Bitget: Hot Wallet 4',
  },
  '0x635308e731a878741bfec299e67f5fd28c7553d9': {
    exchange: 'KuCoin',
    label: 'KuCoin 28',
  },
  '0xb0e5ec2a0bb8b8f3a727787f90b959611e4062b7': {
    exchange: 'LBank',
    label: 'LBank: Hot Wallet 9',
  },
};

export function getCexLabel(address: string): CexLabel | null {
  return labels[address.toLowerCase()] ?? null;
}

export const CEX_LABEL_COUNT = Object.keys(labels).length;

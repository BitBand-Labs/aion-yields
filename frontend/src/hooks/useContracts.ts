'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId } from 'wagmi'
import { parseUnits, formatUnits, erc20Abi, type Address } from 'viem'
import { CONTRACT_ADDRESSES, SUPPORTED_CHAINS } from '@/lib/constants'
import abis from '@/lib/abi/abi.json'

// ── Helpers ──

export function useContractAddresses() {
  const chainId = useChainId()
  const addresses = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES]
  return addresses ?? CONTRACT_ADDRESSES[SUPPORTED_CHAINS.sepolia]
}

function useLendingPoolAddress(): Address {
  return useContractAddresses().LendingPool as Address
}

// ── Read Hooks ──

export function useReserveData(asset: Address | undefined) {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'getReserveData',
    args: asset ? [asset] : undefined,
    query: { enabled: !!asset },
  })
}

export function useUserAccountData(user: Address | undefined) {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'getUserAccountData',
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  })
}

export function useHealthFactor(user: Address | undefined) {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'getHealthFactor',
    args: user ? [user] : undefined,
    query: { enabled: !!user },
  })
}

export function useReservesCount() {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'getReservesCount',
  })
}

export function useReservesList() {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'reservesList',
    args: [BigInt(0)],
    query: { enabled: false }, // We'll fetch individually
  })
}

export function useUserReserveData(asset: Address | undefined, user: Address | undefined) {
  const pool = useLendingPoolAddress()
  return useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'userReserves',
    args: asset && user ? [asset, user] : undefined,
    query: { enabled: !!asset && !!user },
  })
}

export function useAssetPrice(asset: Address | undefined) {
  const addresses = useContractAddresses()
  return useReadContract({
    address: addresses.ChainlinkPriceOracle as Address,
    abi: abis.ChainlinkPriceOracle,
    functionName: 'getAssetPrice',
    args: asset ? [asset] : undefined,
    query: { enabled: !!asset },
  })
}

export function useTokenBalance(token: Address | undefined, account: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: account ? [account] : undefined,
    query: { enabled: !!token && !!account },
  })
}

export function useTokenAllowance(token: Address | undefined, owner: Address | undefined, spender: Address | undefined) {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled: !!token && !!owner && !!spender },
  })
}

// ── Write Hooks ──

export function useApproveToken() {
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = (token: Address, spender: Address, amount: bigint) => {
    writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error }
}

export function useDeposit() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const deposit = (asset: Address, amount: bigint, onBehalfOf: Address) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'deposit',
      args: [asset, amount, onBehalfOf],
    })
  }

  return { deposit, hash, isPending, isConfirming, isSuccess, error }
}

export function useWithdraw() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const withdraw = (asset: Address, amount: bigint, to: Address) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'withdraw',
      args: [asset, amount, to],
    })
  }

  return { withdraw, hash, isPending, isConfirming, isSuccess, error }
}

export function useBorrow() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const borrow = (asset: Address, amount: bigint, onBehalfOf: Address) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'borrow',
      args: [asset, amount, onBehalfOf],
    })
  }

  return { borrow, hash, isPending, isConfirming, isSuccess, error }
}

export function useRepay() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const repay = (asset: Address, amount: bigint, onBehalfOf: Address) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'repay',
      args: [asset, amount, onBehalfOf],
    })
  }

  return { repay, hash, isPending, isConfirming, isSuccess, error }
}

export function useLiquidate() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const liquidate = (
    collateralAsset: Address,
    debtAsset: Address,
    user: Address,
    debtToCover: bigint,
    receiveAToken: boolean
  ) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'liquidate',
      args: [collateralAsset, debtAsset, user, debtToCover, receiveAToken],
    })
  }

  return { liquidate, hash, isPending, isConfirming, isSuccess, error }
}

export function useSetCollateral() {
  const pool = useLendingPoolAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const setCollateral = (asset: Address, useAsCollateral: boolean) => {
    writeContract({
      address: pool,
      abi: abis.LendingPool,
      functionName: 'setUserUseReserveAsCollateral',
      args: [asset, useAsCollateral],
    })
  }

  return { setCollateral, hash, isPending, isConfirming, isSuccess, error }
}

// ── Cross-Chain ──

export function useCrossChainDeposit() {
  const addresses = useContractAddresses()
  const vault = (addresses as any).CrossChainVault as Address
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const depositCrossChain = (
    destinationChainSelector: bigint,
    receiver: Address,
    token: Address,
    amount: bigint
  ) => {
    writeContract({
      address: vault,
      abi: abis.CrossChainVault,
      functionName: 'depositCrossChain',
      args: [destinationChainSelector, receiver, token, amount],
    })
  }

  return { depositCrossChain, hash, isPending, isConfirming, isSuccess, error }
}

// ── Utility ──

export { parseUnits, formatUnits }

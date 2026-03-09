
import * as dotenv from "dotenv";
dotenv.config();
import HardhatMocha from "@nomicfoundation/hardhat-mocha";
import HardhatEthers from "@nomicfoundation/hardhat-ethers";
import HardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import HardhatVerify from "@nomicfoundation/hardhat-verify";
import { HardhatUserConfig } from "hardhat/config";

const providerApiKey = process.env.ALCHEMY_API_KEY || "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";
const deployerPrivateKey =
    process.env.ACCOUNT_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const avaxFujiRpc = process.env.AVAX_FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc";
const etherscanApiKey = process.env.ETHERSCAN_API_KEY || "";
const snowtraceApiKey = process.env.SNOWTRACE_API_KEY || "";

const config: HardhatUserConfig = {
    plugins: [
        HardhatMocha,
        HardhatEthers,
        HardhatNetworkHelpers,
        HardhatVerify,
    ],
    paths: {
        tests: {
            mocha: "test",
        },
    },
    solidity: {
        compilers: [
            {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
        ],
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            type: "edr-simulated",
            accounts: {
                count: 20,
            },
        },
        base: {
            type: "http",
            url: "https://mainnet.base.org",
            chainId: 8453,
            accounts: [deployerPrivateKey],
        },
        baseSepolia: {
            type: "http",
            url: "https://sepolia.base.org",
            chainId: 84532,
            accounts: [deployerPrivateKey],
        },
        sepolia: {
            type: "http",
            url: `https://eth-sepolia.g.alchemy.com/v2/${providerApiKey}`,
            accounts: [deployerPrivateKey],
        },
        mainnet: {
            type: "http",
            url: "https://mainnet.rpc.buidlguidl.com",
            accounts: [deployerPrivateKey],
        },
        arbitrum: {
            type: "http",
            url: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
            accounts: [deployerPrivateKey],
        },
        arbitrumSepolia: {
            type: "http",
            url: `https://arb-sepolia.g.alchemy.com/v2/${providerApiKey}`,
            accounts: [deployerPrivateKey],
        },
        optimism: {
            type: "http",
            url: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
            accounts: [deployerPrivateKey],
        },
        polygon: {
            type: "http",
            url: `https://polygon-mainnet.g.alchemy.com/v2/${providerApiKey}`,
            accounts: [deployerPrivateKey],
        },
        avalancheFuji: {
            type: "http",
            url: avaxFujiRpc,
            chainId: 43113,
            accounts: [deployerPrivateKey],
        },
    },
    verify: {
        etherscan: {
            apiKey: etherscanApiKey,
        },
    },
};

export default config;

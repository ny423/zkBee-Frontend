<template>
  <div id="app" v-if="!mainLoading">
    <h1>Welcome to Stake Bee 👋</h1>
    <div class="title">
      This a simple dApp, which can choose fee token and interact with the
      `bETHMinter` smart contract.
      <p>
        The contract is deployed on the zkSync testnet on
        <a
          :href="`https://sepolia.explorer.zksync.io/address/${MINTER_CONTRACT_ADDRESS}`"
          target="_blank"
        >{{ MINTER_CONTRACT_ADDRESS }}</a
        >
      </p>
    </div>
    <div class="main-box">
      <div class="balance beth">
        <p>
          Staked ETH Balance: <span>{{ currentbETHBalance }} bETH</span>
        </p>
      </div>
      <div>
        Select token:
        <select v-model="selectedTokenAddress" @change="changeToken">
          <option
            v-for="token in tokens"
            v-bind:value="token.address"
            v-bind:key="token.address"
          >
            {{ token.symbol }}
          </option>
        </select>
      </div>
      <div class="balance gas-token" v-if="selectedToken">
        <p>
          Balance: <span v-if="retrievingBalance">Loading...</span>
          <span v-else>{{ currentBalance }} {{ selectedToken.symbol }}</span>
        </p>
        <p>
          Expected fee: <span v-if="retrievingFee">Loading...</span>
          <span v-else>{{ currentFee }} {{ selectedToken.symbol }}</span>
          <button class="refresh-button" @click="updateFee">Refresh</button>
        </p>
      </div>
      <div class="greeting-input">
        <input
          v-model="stakeValue"
          :disabled="!selectedToken || txStatus != 0"
          placeholder="Input stake value here..."
        />

        <button
          class="change-button"
          :disabled="!selectedToken || txStatus != 0 || retrievingFee"
          @click="clickSubmit"
        >
          <span v-if="selectedToken && !txStatus">Submit</span>
          <span v-else-if="!selectedToken">Select token to pay fee first</span>
          <span v-else-if="txStatus === 1">Sending tx...</span>
          <span v-else-if="txStatus === 2"
          >Waiting until tx is committed...</span
          >
          <span v-else-if="txStatus === 3">Updating the page...</span>
          <span v-else-if="retrievingFee">Updating the fee...</span>
        </button>
      </div>
    </div>
  </div>
  <div id="app" v-else>
    <div class="start-screen">
      <h1>Welcome to Stake Bee dApp!</h1>
      <button v-if="correctNetwork" @click="connectMetamask">
        Connect Metamask
      </button>
      <button v-else @click="addZkSyncSepolia">Switch to zkSync Sepolia</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ethers, parseEther } from "ethers";
import { Contract, BrowserProvider, Provider, utils, Wallet } from "zksync-ethers";

const MINTER_CONTRACT_ADDRESS = "0x2cABA947FB69fFfE6c4404682CB0512A94D22318";
import MINTER_CONTRACT_ABI from "./abi.json";

const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
const BETH_ADDRESS = "0x8Ca4a1c501A5d319d30a80a2aDf2226fd4f9A6A8";
import allowedTokens from "./erc20.json";

// reactive references
const correctNetwork = ref(false);
const tokens = ref(allowedTokens);
// const newGreeting = ref("");
// const greeting = ref("");
const stakeValue = ref("");
const mainLoading = ref(true);
const retrievingFee = ref(false);
const retrievingBalance = ref(false);
const currentBalance = ref("");
const currentFee = ref("");
const retrievingbETHBalance = ref(false);
const currentbETHBalance = ref("");
const selectedTokenAddress = ref(null);
const selectedToken = ref<{
  l2Address: string;
  decimals: number;
  symbol: string;
} | null>(null);
// txStatus is a reactive variable that tracks the status of the transaction
// 0 stands for no status, i.e no tx has been sent
// 1 stands for tx is beeing submitted to the operator
// 2 stands for tx awaiting commit
// 3 stands for updating the balance and greeting on the page
const txStatus = ref(0);

let provider: Provider | null = null;
let signer: Wallet | null = null;
let contract: Contract | null = null;

// Lifecycle hook
onMounted(async () => {
  const network = await window.ethereum?.request<string>({
    method: "net_version",
  });
  if (network !== null && network !== undefined && +network === 300) {
    correctNetwork.value = true;
  }
});

const initializeProviderAndSigner = async () => {
  provider = new Provider("https://sepolia.era.zksync.dev");
  // Note that we still need to get the Metamask signer
  signer = await new BrowserProvider(window.ethereum).getSigner();
  contract = new Contract(MINTER_CONTRACT_ADDRESS, MINTER_CONTRACT_ABI, signer);
  currentbETHBalance.value = await getbETHBalance();
};

const getFee = async () => {
  // Getting the amount of gas (gas) needed for one transaction
  const feeInGas = await contract.setGreeting.estimateGas(newGreeting.value);
  // Getting the gas price per one erg. For now, it is the same for all tokens.
  const gasPriceInUnits = await provider.getGasPrice();

  // To display the number of tokens in the human-readable format, we need to format them,
  // e.g. if feeInGas*gasPriceInUnits returns 500000000000000000 wei of ETH, we want to display 0.5 ETH the user
  return ethers.formatUnits(feeInGas * gasPriceInUnits, selectedToken.value.decimals);
};


const getBalance = async () => {
  // Getting the balance for the signer in the selected token
  const balanceInUnits = await signer.getBalance(selectedToken.value.l2Address);
  // To display the number of tokens in the human-readable format, we need to format them,
  // e.g. if balanceInUnits returns 500000000000000000 wei of ETH, we want to display 0.5 ETH the user
  return ethers.formatUnits(balanceInUnits, selectedToken.value.decimals);
};

const getbETHBalance = async () => {
  // Getting the balance for the signer in the selected token
  const balanceInUnits = await signer.getBalance(BETH_ADDRESS);
  // To display the number of tokens in the human-readable format, we need to format them,
  // e.g. if balanceInUnits returns 500000000000000000 wei of ETH, we want to display 0.5 ETH the user
  return ethers.formatUnits(balanceInUnits, 18);
};

const getOverrides = async () => {
  if (selectedToken.value.l2Address != ETH_ADDRESS) {
    const testnetPaymaster = await provider.getTestnetPaymasterAddress();

    const gasPrice = await provider.getGasPrice();

    // define paymaster parameters for gas estimation
    const paramsForFeeEstimation = utils.getPaymasterParams(testnetPaymaster, {
      type: "ApprovalBased",
      minimalAllowance: BigInt("1"),
      token: selectedToken.value.l2Address,
      innerInput: new Uint8Array(),
    });

    // estimate gasLimit via paymaster
    const gasLimit = await contract.submit.estimateGas(stakeValue.value, {
      customData: {
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
        paymasterParams: paramsForFeeEstimation,
      },
    });

    // fee calculated in ETH will be the same in
    // ERC20 token using the testnet paymaster
    const fee = gasPrice * gasLimit;

    const paymasterParams = utils.getPaymasterParams(testnetPaymaster, {
      type: "ApprovalBased",
      token: selectedToken.value.l2Address,
      // provide estimated fee as allowance
      minimalAllowance: fee,
      // empty bytes as testnet paymaster does not use innerInput
      innerInput: new Uint8Array(),
    });

    return {
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: BigInt(1),
      gasLimit,
      customData: {
        gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
        paymasterParams,
      },
    };
  }

  return {};
};

/* State Updates */

const clickSubmit = async () => {
  txStatus.value = 1;
  try {
    const overrides = await getOverrides();
    const txHandle = await contract.submit(stakeValue.value, overrides);

    txStatus.value = 2;

    // Wait until the transaction is committed
    await txHandle.wait();
    txStatus.value = 3;

    retrievingFee.value = true;
    retrievingBalance.value = true;
    // Update balance and fee
    currentBalance.value = await getBalance();
    currentbETHBalance.value = await getbETHBalance();
    currentFee.value = await getFee();
  } catch (e) {
    console.error(e);
    alert(e);
  }
}

  const updateFee = async () => {
    retrievingFee.value = true;
    getFee()
      .then((fee) => {
        currentFee.value = fee;
      })
      .catch((e) => console.log(e))
      .finally(() => {
        retrievingFee.value = false;
      });
  };
  const updateBalance = async () => {
    retrievingBalance.value = true;
    getBalance()
      .then((balance) => {
        currentBalance.value = balance;
      })
      .catch((e) => console.log(e))
      .finally(() => {
        retrievingBalance.value = false;
      });

    getbETHBalance().then((balance) => {
      currentbETHBalance.value = balance;
    })
      .catch((e) => console.log(e))
      .finally(() => {
        retrievingBalance.value = false;
      });
  };
  const changeToken = async () => {
    retrievingFee.value = true;
    retrievingBalance.value = true;

    const tokenAddress = tokens.value.filter(
      (t) => t.address === selectedTokenAddress.value,
    )[0];
    selectedToken.value = {
      l2Address: tokenAddress.address,
      decimals: tokenAddress.decimals,
      symbol: tokenAddress.symbol,
    };
    try {
      updateFee();
      updateBalance();
    } catch (e) {
      console.log(e);
    } finally {
      retrievingFee.value = false;
      retrievingBalance.value = false;
    }
  };
  const loadMainScreen = async () => {
    await initializeProviderAndSigner();

    if (!provider || !signer) {
      alert("Follow the tutorial to learn how to connect to Metamask!");
      return;
    }

    mainLoading.value = false;
  };
  const addZkSyncSepolia = async () => {
    // add zkSync testnet to Metamask
    await window.ethereum?.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x12C",
          chainName: "zkSync Sepolia testnet",
          rpcUrls: ["https://sepolia.era.zksync.dev"],
          blockExplorerUrls: ["https://sepolia.explorer.zksync.io/"],
          nativeCurrency: {
            name: "ETH",
            symbol: "ETH",
            decimals: 18,
          },
        },
      ],
    });
    window.location.reload();
  };
  const connectMetamask = async () => {
    await window.ethereum
      ?.request({ method: "eth_requestAccounts" })
      .catch((e: unknown) => console.error(e));

    loadMainScreen();
  }
</script>

<style scoped>
input,
select {
  padding: 8px 3px;
  margin: 0 5px;
}

button {
  margin: 0 5px;
}

.title,
.main-box,
.greeting-input,
.balance {
  margin: 10px;
}
</style>

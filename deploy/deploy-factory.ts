import { utils, Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
    const wallet = new Wallet(process.env.TEST_PK!);
    const deployer = new Deployer(hre, wallet);
    const factoryArtifact = await deployer.loadArtifact("AAFactory");
    const aaArtifact = await deployer.loadArtifact("TwoUserMultisig");

    // Deposit some funds to L2 in order to be able to perform L2 transactions.
    // You can remove the depositing step if you know that the `wallet` has enough
    // funds on zkSync.
    // const depositAmount = ethers.utils.parseEther("0.001");
    // const depositHandle = await deployer.zkWallet.deposit({
    //     to: deployer.zkWallet.address,
    //     token: utils.ETH_ADDRESS,
    //     amount: depositAmount,
    // });
    // await depositHandle.wait();

    // Getting the bytecodeHash of the AA
    const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode);

    const factory = await deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [
        // Since the factory requires the code for the AA to be available,
        // we should pass it here as well
        aaArtifact.bytecode
    ]);

    console.log(`AA factory address: ${factory.address}`);
}
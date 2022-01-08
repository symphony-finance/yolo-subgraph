import {
    Bytes,
    BigInt,
    Address,
    ethereum,
    BigDecimal,
} from "@graphprotocol/graph-ts";
import {
    User,
    Executor,
    TokenDetail,
} from "../../generated/schema";
import {
    stateId,
    BIGINT_TEN,
    BIGINT_ZERO,
    ACTION_CREATED,
} from "./constants";

export class Order {
    creator: Address;
    recipient: Address;
    inputToken: Address;
    outputToken: Address;
    inputAmount: BigInt;
    minReturnAmount: BigInt;
    stoplossAmount: BigInt;
    shares: BigInt;
    executor: Address;
    executionFee: BigInt;
}

export function createUser(
    userAddress: Bytes,
): void {
    let userId = userAddress
        .toHexString();

    let user = User.load(userId);
    if (!user) {
        user = new User(userId);
        user.address = userAddress;
        user.save();
    }
};

export function createExecutor(
    executorAddress: Bytes,
): void {
    let executorId = executorAddress
        .toHexString();

    let executor = Executor.load(executorId);
    if (!executor) {
        executor = new Executor(executorId);
        executor.address = executorAddress;
        executor.save();
    }
};

export function getAmountWithoutDecimals(
    amount: BigInt,
    decimals: i32,
): BigDecimal {
    return amount.divDecimal((
        BIGINT_TEN.pow(<u8>(decimals))
    ).toBigDecimal());
};

export function createTokenEntity(
    token: Bytes
): void {
    let tokenId = token.toHexString();
    let tokenDetails = TokenDetail.load(tokenId);

    if (!tokenDetails) {
        tokenDetails = new TokenDetail(tokenId);
        tokenDetails.address = token;
        tokenDetails.totalFunds = BIGINT_ZERO;
        tokenDetails.totalShares = BIGINT_ZERO;
        tokenDetails.bufferPercent = BIGINT_ZERO;
        tokenDetails.isWhitelistToken = true;
        tokenDetails.save();
    }
}

export function updateTotalTokens(
    asset: Bytes,
    amount: BigInt,
    shares: BigInt,
    action: String
): void {
    let assetId = asset.toHexString();
    let tokenDetails = TokenDetail.load(assetId);

    if (tokenDetails) {

        if (action === ACTION_CREATED) {
            tokenDetails.totalFunds = tokenDetails
                .totalFunds.plus(amount);

            tokenDetails.totalShares = tokenDetails
                .totalShares.plus(shares);
        } else {
            amount = amount.times(tokenDetails.totalFunds)
                .div(tokenDetails.totalShares);

            tokenDetails.totalFunds = tokenDetails
                .totalFunds.minus(amount);

            tokenDetails.totalShares = tokenDetails
                .totalShares.minus(shares);
        }

        tokenDetails.save();
    }
}

export function calculateYield(
    inputAmount: BigInt,
    depositPlusYield: BigInt
): BigInt {
    if (depositPlusYield.lt(inputAmount)) {
        return BIGINT_ZERO
    } else {
        return depositPlusYield.minus(inputAmount)
    }
}

export function decodeOrder(encoded: Bytes): Order {
    const decoded = (ethereum.decode(
        '(address,address,address,address,uint256,uint256,uint256,uint256,address,uint256)',
        encoded
    ) as ethereum.Value).toTuple();

    return {
        creator: decoded[0].toAddress(),
        recipient: decoded[1].toAddress(),
        inputToken: decoded[2].toAddress(),
        outputToken: decoded[3].toAddress(),
        inputAmount: decoded[4].toBigInt(),
        minReturnAmount: decoded[5].toBigInt(),
        stoplossAmount: decoded[6].toBigInt(),
        shares: decoded[7].toBigInt(),
        executor: decoded[8].toAddress(),
        executionFee: decoded[9].toBigInt(),
    }
}

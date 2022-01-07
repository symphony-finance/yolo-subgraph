import {
  store,
  Bytes,
  BigInt,
  BigDecimal,
  log,
} from '@graphprotocol/graph-ts';
import {
  State,
  Order,
  Handler,
  Rebalance,
  TokenDetail,
} from '../generated/schema';
import {
  stateId,
  BIGINT_ZERO,
  BIGINT_TEN,
  TWO_HOURS,
  ZERO_ADDRESS,
  ACTION_CREATED,
  STATUS_ACTIVE,
  STATUS_EXECUTED,
  STATUS_CANCELLED,
  PERCENTAGE_FACTOR,
  PERCENTAGE_FACTOR_DECIMAL,
} from "./utils/constants";
import {
  OrderCreated,
  OrderUpdated,
  OrderExecuted,
  OrderCancelled,
  AddedWhitelistToken,
  RemovedWhitelistToken,
  BaseFeeUpdated,
  ProtocolFeeUpdated,
  CancellationFeeUpdated,
  HandlerAdded,
  HandlerRemoved,
  TokensRebalanced,
  TokenBufferUpdated,
  TokenStrategyUpdated,
} from '../generated/Yolo/Yolo';
import {
  createUser,
  decodeOrder,
  createExecutor,
  calculateYield,
  createTokenEntity,
  updateTotalTokens,
  calcReturnAmount,
} from './utils/helpers';

export function handleOrderCreated(
  event: OrderCreated
): void {
  let id = event.params.orderId.toHexString();
  let orderData = event.params.data;
  let decodedOrder = decodeOrder(orderData);

  let order = new Order(id);
  order.status = STATUS_ACTIVE;
  order.orderId = event.params.orderId;
  order.creator = decodedOrder.creator.toHexString();
  order.recipient = decodedOrder.recipient;
  order.inputToken = decodedOrder.inputToken;
  order.outputToken = decodedOrder.outputToken;
  order.inputAmount = decodedOrder.inputAmount;
  order.minReturnAmount = decodedOrder.minReturnAmount;
  order.stoplossAmount = decodedOrder.stoplossAmount;
  order.shares = decodedOrder.shares;
  order.createdAtBlock = event.block.number;
  order.orderEncodedData = event.params.data;
  order.createdTxHash = event.transaction.hash;
  if (decodedOrder.executor.toHexString() != ZERO_ADDRESS) {
    order.executor = decodedOrder.executor.toHexString();
    createExecutor(decodedOrder.executor);
  }
  order.save();

  createUser(decodedOrder.recipient);
  createTokenEntity(decodedOrder.inputToken);
  createTokenEntity(decodedOrder.outputToken);
  updateTotalTokens(
    decodedOrder.inputToken,
    decodedOrder.inputAmount,
    decodedOrder.shares,
    ACTION_CREATED,
  );
}

export function handleOrderCancelled(
  event: OrderCancelled
): void {
  let id = event.params.orderId.toHexString();
  let order = Order.load(id);

  if (order) {
    order.status = STATUS_CANCELLED;
    order.updatedAt = event.block.timestamp;
    order.cancelledTxHash = event.transaction.hash;
    order.yieldEarned = calculateYield(
      order.inputAmount,
      event.params.amountReceived,
    )
    order.save();

    updateTotalTokens(
      order.inputToken,
      order.inputAmount,
      order.shares,
      STATUS_CANCELLED,
    );
  }
}

export function handleOrderExecuted(
  event: OrderExecuted
): void {
  let id = event.params.orderId.toHexString();
  let order = Order.load(id);

  if (order) {
    order.status = STATUS_EXECUTED;
    order.updatedAt = event.block.timestamp;
    order.executedAtBlock = event.block.timestamp;
    order.executedTxHash = event.transaction.hash;
    order.yieldEarned = calculateYield(
      order.inputAmount,
      event.params.depositPlusYield,
    )
    order.returnAmount = event.params.amountReceived;
    if (!order.executor) {
      createExecutor(event.transaction.from);
      order.executor = event.transaction.from.toHexString();
    }
    order.save();

    updateTotalTokens(
      order.inputToken,
      order.inputAmount,
      order.shares,
      STATUS_EXECUTED,
    );
  }
}

export function handleOrderUpdated(
  event: OrderUpdated
): void {
  let oldOrderId = event.params.oldOrderId.toHexString();
  let oldOrder = Order.load(oldOrderId);

  if (oldOrder) {
    let orderData = event.params.data;
    let decodedOrder = decodeOrder(orderData);

    let newOrder = new Order(
      event.params.newOrderId.toHexString()
    )

    newOrder.status = STATUS_ACTIVE;
    newOrder.orderId = event.params.newOrderId;
    newOrder.creator = decodedOrder.creator.toHexString();
    newOrder.recipient = decodedOrder.recipient;
    newOrder.inputToken = decodedOrder.inputToken;
    newOrder.outputToken = decodedOrder.outputToken;
    newOrder.inputAmount = decodedOrder.inputAmount;
    newOrder.minReturnAmount = decodedOrder.minReturnAmount;
    newOrder.stoplossAmount = decodedOrder.stoplossAmount;
    newOrder.shares = decodedOrder.shares;
    newOrder.orderEncodedData = orderData;
    newOrder.createdAtBlock = oldOrder.createdAtBlock;
    newOrder.createdTxHash = oldOrder.createdTxHash;
    if (decodedOrder.executor.toHexString() != oldOrder.executor) {
      newOrder.executor = decodedOrder.executor.toHexString();
      createExecutor(
        Bytes.fromByteArray(
          Bytes.fromHexString(newOrder.executor as string)
        )
      );
    }

    store.remove('Order', oldOrderId);
    newOrder.save();

    createTokenEntity(decodedOrder.outputToken);
  }
}

export function handleTokenStrategyUpdated(
  event: TokenStrategyUpdated
): void {
  createTokenEntity(event.params.token);

  let id = event.params.token.toHexString();
  let tokenDetails = TokenDetail.load(id);

  if (tokenDetails) {
    tokenDetails.strategy = event.params.strategy;
    tokenDetails.save();
  }
}

export function handleBaseFeeUpdated(
  event: BaseFeeUpdated
): void {
  let state = State.load(stateId);
  if (!state) {
    state = new State(stateId);
    state.lastRebalanceTime = BIGINT_ZERO;
  }

  state.baseFeePercent = event.params.feePercent
    .divDecimal(PERCENTAGE_FACTOR_DECIMAL);
  state.save();
}

export function handleProtocolFeeUpdated(
  event: ProtocolFeeUpdated
): void {
  let state = State.load(stateId);
  if (!state) {
    state = new State(stateId);
    state.lastRebalanceTime = BIGINT_ZERO;
  }

  if (state) {
    state.protocolFeePercent = event.params.feePercent
      .divDecimal(PERCENTAGE_FACTOR_DECIMAL)
      .times(state.baseFeePercent as BigDecimal)
      .div(PERCENTAGE_FACTOR_DECIMAL);
    state.executorFeePercent = (
      state.baseFeePercent as BigDecimal
    ).minus(state.protocolFeePercent as BigDecimal);
    state.save();
  }
}

export function handleCancellationFeeUpdated(
  event: CancellationFeeUpdated
): void {
  let state = State.load(stateId);
  if (!state) {
    state = new State(stateId);
    state.lastRebalanceTime = BIGINT_ZERO;
  }

  state.cancellationFeePercent = event.params
    .feePercent.divDecimal(PERCENTAGE_FACTOR_DECIMAL);
  state.save();
}

export function handleTokenBufferUpdated(
  event: TokenBufferUpdated
): void {
  createTokenEntity(event.params.token);

  let id = event.params.token.toHexString();
  let tokenDetails = TokenDetail.load(id);

  if (tokenDetails) {
    tokenDetails.bufferPercent = event.params
      .bufferPercent.div(PERCENTAGE_FACTOR);
    tokenDetails.save();
  }
}

export function handleHandlerAdded(
  event: HandlerAdded
): void {
  let state = State.load(stateId);
  if (!state) {
    state = new State(stateId);
    state.lastRebalanceTime = BIGINT_ZERO;
    state.save();
  }

  let handlerId = event.params.handler.toHexString();
  let handler = Handler.load(handlerId);
  if (handler == null) {
    handler = new Handler(handlerId);
    handler.state = stateId;
    handler.address = event.params.handler;
    handler.save();
  }
}

export function handleHandlerRemoved(
  event: HandlerRemoved
): void {
  let handlerId = event.params.handler
    .toHexString();
  store.remove('Handler', handlerId);
}

export function handleAddedWhitelistToken(
  event: AddedWhitelistToken
): void {
  createTokenEntity(event.params.token);

  let id = event.params.token.toHexString();
  let tokenDetails = TokenDetail.load(id);

  if (tokenDetails) {
    tokenDetails.isWhitelistToken = true;
    tokenDetails.save();
  }
}

export function handleRemovedWhitelistToken(
  event: RemovedWhitelistToken
): void {
  createTokenEntity(event.params.token);

  let id = event.params.token.toHexString();
  let tokenDetails = TokenDetail.load(id);

  if (tokenDetails) {
    tokenDetails.isWhitelistToken = false;
    tokenDetails.save();
  }
}


export function handleTokensRebalanced(
  event: TokensRebalanced
): void {
  let timestamp = event.block.timestamp;
  let id = timestamp.toString();
  let rebalance = Rebalance.load(id);
  let state = State.load(stateId);

  if (
    !rebalance && state
    && timestamp >= state.lastRebalanceTime.plus(TWO_HOURS)
  ) {
    rebalance = new Rebalance(id);
    rebalance.txCost =
      new BigDecimal(event.params.txCost.plus(
        BigInt.fromI32(30995).times(event.transaction.gasPrice))
      ).div(BIGINT_TEN.pow(18).toBigDecimal());
    rebalance.rebalancedBy = event.transaction.from;
    rebalance.timestamp = timestamp;
    rebalance.txHash = event.transaction.hash;
    rebalance.save();

    state.lastRebalanceTime = timestamp;
    state.save();
  }
}

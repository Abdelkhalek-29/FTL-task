import userModel from "../../../../DB/model/User.model.js";
import { asyncHandler } from "../../../utils/errorHandling.js";
import transactionModel from "../../../../DB/model/transactions.model.js";
import {
  initiateApplePayPaymentService,
  initiateCardPaymentService,
  initiateGooglePayPaymentService,
  initiatePayPalPaymentService,
} from "../../../utils/payment.js";
export const charging = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { amount, method } = req.body;

  let paymentResponse;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount provided",
    });
  }

  const validAmount = Number(parseFloat(amount).toFixed(2));

  switch (method) {
    case "Card":
      paymentResponse = await initiateCardPaymentService({
        amount: validAmount,
        name: "wallet charging",
      });
      break;
    case "Apple":
      paymentResponse = await initiateApplePayPaymentService({
        amount: validAmount,
        name: "wallet charging",
        returnUrl:
          "http://127.0.0.1:5500/src/modules/payment/controller/success.html",
      });
      break;
    case "Google":
      paymentResponse = await initiateGooglePayPaymentService({
        amount: validAmount,
        name: "wallet charging",
        userId,
        currency: "SAR",
        returnUrl:
          "http://127.0.0.1:5500/src/modules/payment/controller/success.html",
      });
      break;
    case "PayPal":
      paymentResponse = await initiatePayPalPaymentService({
        amount: validAmount,
        name: "wallet charging",
        returnUrl:
          "http://127.0.0.1:5500/src/modules/payment/controller/success.html",
      });
      break;
    default:
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
  }
  const user = await userModel.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  user.wallet.balance += validAmount;
  user.wallet.total_Deposit += validAmount;
  user.wallet.lastUpdated = Date.now();
  await user.save();

  await transactionModel.create({
    actorId: userId,
    actorType: "User",
    amount: validAmount,
    type: "Wallet",
    method,
    orderId: paymentResponse.result.orderId,
    reason: "Wallet recharge",
    status: "pending",
  });

  res.status(200).json({
    success: true,
    message: "Go to checkout page!",
    paymentResponse: paymentResponse.result.checkoutData.postUrl,
  });
});

export const userWallet = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const { minAmount, maxAmount, fromDate, toDate, type, sortBy, sortOrder } =
    req.query;

  const filter = { actorId: userId };

  if (minAmount || maxAmount) {
    filter.amount = {};
    if (minAmount) filter.amount.$gte = Number(minAmount);
    if (maxAmount) filter.amount.$lte = Number(maxAmount);
  }

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  if (type) {
    filter.type = type;
  }

  const sortOptions = {};
  if (sortBy) {
    const sortField = sortBy === "amount" ? "amount" : "createdAt";
    sortOptions[sortField] = sortOrder === "asc" ? 1 : -1;
  } else {
    sortOptions.createdAt = -1;
  }

  const userBalance = await userModel.findById(userId).select("wallet");

  const transactions = await transactionModel
    .find(filter)
    .sort(sortOptions)
    .select("-actorType -actorId");

  res.status(200).json({
    success: true,
    data: { userBalance, transactions },
  });
});

export const noonWebhook = asyncHandler(async (req, res) => {
  const noonSignature = req.headers["noon-signature"];
  const {
    event,
    data: {
      order: { orderId, amount, status, userId, paymentMethod },
    },
  } = req.body;

  switch (event) {
    case "payment.success":
      const user = await userModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      await transactionModel.findOneAndUpdate(
        { orderId },
        { status: "completed" }
      );

      res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
      });
      break;

    case "payment.failed":
      await transactionModel.findOneAndUpdate(
        { orderId },
        {
          status: "failed",
          failureReason: status.message || "Payment failed",
        }
      );

      res.status(200).json({
        success: true,
        message: "Failed payment webhook processed",
      });
      break;

    default:
      res.status(400).json({
        success: false,
        message: "Unknown webhook event",
      });
  }
});

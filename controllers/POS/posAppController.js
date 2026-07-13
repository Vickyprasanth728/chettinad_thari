import { posSuccess, posError } from "../../Utils/posResponse.js";
import * as posApp from "../../services/posAppService.js";

function handleError(res, error) {
  const status = error.status || 500;
  return posError(res, error.code || "SERVER_ERROR", error.message || "Internal server error", status);
}

export const posQuoteBilling = async (req, res) => {
  try {
    const quote = await posApp.quoteBilling(req.body);
    if (quote.validationErrors?.length) {
      return posError(res, "VALIDATION_FAILED", "Billing validation failed.", 422, quote.validationErrors);
    }
    return posSuccess(res, quote);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posNextBillNo = async (req, res) => {
  try {
    const data = await posApp.getNextBillNo();
    return posSuccess(res, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posCheckoutBilling = async (req, res) => {
  try {
    const result = await posApp.checkoutBilling(req.body, req.user?.id);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status, result.details);
    }
    return posSuccess(res, result.data, result.status);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posGetBill = async (req, res) => {
  try {
    const data = await posApp.getBillByBillNo(req.params.billNo);
    if (!data) return posError(res, "NOT_FOUND", "Bill not found.", 404);
    return posSuccess(res, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posQuoteReturn = async (req, res) => {
  try {
    const result = await posApp.quoteReturn(req.body);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status, result.details);
    }
    return posSuccess(res, result.data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posCheckoutReturn = async (req, res) => {
  try {
    const result = await posApp.checkoutReturn(req.body, req.user?.id);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status, result.details);
    }
    return posSuccess(res, result.data, result.status);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posQuoteCancelBill = async (req, res) => {
  try {
    const result = await posApp.quoteCancelBill(req.body);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status, result.details);
    }
    return posSuccess(res, result.data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posCheckoutCancelBill = async (req, res) => {
  try {
    const result = await posApp.checkoutCancelBill(req.body, req.user?.id);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status, result.details);
    }
    return posSuccess(res, result.data, result.status);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posSearchCustomers = async (req, res) => {
  try {
    const data = await posApp.searchCustomers(req.query.q);
    return posSuccess(res, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posCreditWallet = async (req, res) => {
  try {
    const data = await posApp.getCreditWallet(req.params.customerId);
    if (!data) return posError(res, "NOT_FOUND", "Customer not found.", 404);
    return posSuccess(res, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posApplyWallet = async (req, res) => {
  try {
    const result = await posApp.applyWalletCredit(req.params.customerId, req.body.amount);
    if (!result.ok) {
      return posError(res, result.code, result.message, result.status);
    }
    return posSuccess(res, result.data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posSearchProducts = async (req, res) => {
  try {
    const data = await posApp.searchProducts(req.query.q, req.query);
    return res.status(200).json({
      success: true,
      count: Array.isArray(data) ? data.length : 0,
      data,
      meta: {},
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const posCheckBillingStock = async (req, res) => {
  try {
    const result = await posApp.checkBillingStock(req.body.items || []);
    if (!result.ok) {
      return posError(
        res,
        "INSUFFICIENT_STOCK",
        "One or more items exceed available stock.",
        409,
        result.details
      );
    }
    return posSuccess(res, result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posOutOfStockProducts = async (req, res) => {
  try {
    const data = await posApp.listOutOfStock(req.query);
    return posSuccess(res, data);
  } catch (error) {
    return handleError(res, error);
  }
};

export const posReportDaily = async (req, res) => {
  try {
    return posSuccess(res, await posApp.reportDailySummary());
  } catch (error) {
    return handleError(res, error);
  }
};

export const posReportGst = async (req, res) => {
  try {
    return posSuccess(res, await posApp.reportGstSummary());
  } catch (error) {
    return handleError(res, error);
  }
};

export const posReportPayments = async (req, res) => {
  try {
    return posSuccess(res, await posApp.reportPaymentModes());
  } catch (error) {
    return handleError(res, error);
  }
};

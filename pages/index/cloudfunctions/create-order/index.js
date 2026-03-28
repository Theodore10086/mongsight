/**
 * 微信云函数 - 创建商城订单
 * 文件: cloudfunctions/create-order/index.js
 * 功能: 创建订单记录，处理支付回调
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 云函数入口
 * @param {object} event - 请求参数
 * @param {string} event.productId - 商品 ID
 * @param {number} event.quantity - 数量
 * @param {string} event.paymentMethod - 支付方式: wechat/balance
 * @param {object} event.address - 收货地址 (可选)
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  
  const { 
    productId, 
    quantity = 1,
    paymentMethod = 'wechat',
    address = null
  } = event;
  
  console.log('[CreateOrder] ProductId:', productId, 'OpenId:', openId);
  
  if (!productId) {
    return { success: false, error: '缺少商品 ID' };
  }
  
  try {
    // 查询商品信息
    const productQuery = await db.collection('products').doc(productId).get();
    const product = productQuery.data;
    
    if (!product) {
      return { success: false, error: '商品不存在' };
    }
    
    if (product.stock < quantity) {
      return { success: false, error: '库存不足' };
    }
    
    // 生成订单号
    const orderId = generateOrderId(openId, productId);
    
    // 计算订单金额
    const totalAmount = product.price * quantity;
    
    // 创建订单记录
    const order = {
      _openid: openId,
      order_id: orderId,
      product_id: productId,
      product_name: product.name,
      product_image: product.image,
      quantity: quantity,
      unit_price: product.price,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      status: 'pending',
      address: address,
      create_time: db.serverDate(),
      pay_time: null,
      deliver_time: null,
      complete_time: null
    };
    
    const addResult = await db.collection('orders').add({
      data: order
    });
    
    console.log('[CreateOrder] Order created:', orderId);
    
    // 如果是微信支付，调用统一下单
    let payInfo = null;
    if (paymentMethod === 'wechat') {
      try {
        payInfo = await createWechatPayOrder(openId, orderId, totalAmount);
      } catch (payError) {
        console.error('[CreateOrder] WeChat Pay error:', payError.message);
      }
    }
    
    return {
      success: true,
      data: {
        orderId: orderId,
        orderDbId: addResult._id,
        totalAmount: totalAmount,
        payInfo: payInfo
      }
    };
    
  } catch (error) {
    console.error('[CreateOrder] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 生成订单号
 */
function generateOrderId(openId, productId) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `MC${timestamp}${random}`;
}

/**
 * 微信支付统一下单 (示例)
 * 实际需要调用微信支付 API
 */
async function createWechatPayOrder(openId, orderId, amount) {
  // 实际实现需要:
  // 1. 调用 wx.cloud.callFunction({name: 'openapi', data: {action: 'payment'}})
  // 2. 或使用微信支付商户平台的 API
  
  // 返回模拟的支付参数
  return {
    orderId: orderId,
    amount: amount,
    message: '支付功能需要配置微信支付商户号'
  };
}

/**
 * 微信支付回调云函数
 * 文件: cloudfunctions/order-callback/index.js
 * 处理微信支付成功后的回调
 */
exports.handlePayCallback = async (orderId, transactionId) => {
  try {
    // 查询订单
    const orderQuery = await db.collection('orders').where({
      order_id: orderId
    }).get();
    
    if (!orderQuery.data || orderQuery.data.length === 0) {
      throw new Error('订单不存在');
    }
    
    const order = orderQuery.data[0];
    
    // 更新订单状态
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'paid',
        pay_time: db.serverDate(),
        transaction_id: transactionId
      }
    });
    
    // 扣除商品库存
    await db.collection('products').doc(order.product_id).update({
      data: {
        stock: _.inc(-order.quantity)
      }
    });
    
    console.log('[OrderCallback] Order paid:', orderId);
    
    return { success: true };
    
  } catch (error) {
    console.error('[OrderCallback] Error:', error);
    return { success: false, error: error.message };
  }
};

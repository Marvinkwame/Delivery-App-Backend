import { Request, Response } from "express";
import Stripe from "stripe";
import Restaurant, { MenuItemType } from "../models/Restaurant";
import Order from "../models/Order";

const STRIPE = new Stripe(process.env.STRIPE_API_KEY as string);
const FRONTEND_URL = process.env.FRONTEND_URL as string;
const STRIPE_ENDPOINT_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

type CheckoutSessionRequest = {
  cartItems: {
    //get the price from the backend for security reasons
    menuItemId: string;
    name: string;
    quantity: string;
  }[]; //an array of cartItems
  deliveryDetails: {
    email: string;
    name: string;
    addressLine1: string;
    city: string;
  };
  restaurantId: string;
};


const getMyOrders = async (req: Request, res: Response) => {
  try{
    const orders = await Order.find({ user: req.userId }).populate("restaurant").populate("user"); //adds the restaurant and user to the orders 

    if(!orders) {
      return res.status(400).json({ message: 'No Orders found'})
    }

    res.json(orders)
  } catch(err) {
    console.log(err)
    res.status(500).json({ message: "Something went wrong" })
  }
}

const stripeWebhookHandler = async (req: Request, res: Response) => {
  let event;
  try {
    const sig = req.headers["stripe-signature"];
    //STRIPE verifies the request by using the endpoint secret then constructs the event
    //and gives us the results in the event object
    event = STRIPE.webhooks.constructEvent(
      req.body,
      sig as string,
      STRIPE_ENDPOINT_SECRET
    );
  } catch (err: any) {
    console.log(err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if(event?.type === "checkout.session.completed") {
    const order = await Order.findById(event.data.object.metadata?.orderId);

    if(!order) {
      return res.status(400).json({ message: "Order not found" });
    }

    order.totalAmount = event.data.object.amount_total;
    order.status = "paid";

    await order.save();
  }

  res.status(200).send();
};

const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    //take the cartitems and order details from the req.body
    const checkoutSessionRequest: CheckoutSessionRequest = req.body;
    const restaurant = await Restaurant.findById(
      checkoutSessionRequest.restaurantId
    );

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const newOrder = new Order({
      restaurant: restaurant,
      user: req.userId,
      status: "placed",
      deliveryDetails: checkoutSessionRequest.deliveryDetails,
      cartItems: checkoutSessionRequest.cartItems,
      createdAt: new Date(),
    });

    const lineItems = createLineItems(
      checkoutSessionRequest,
      restaurant.menuItems
    ); //send it to stripe. Its an array

    const session = await createSession(
      //simply creating the checkout page for the user
      lineItems,
      newOrder._id.toString(),
      restaurant.deliveryPrice,
      restaurant._id.toString()
    );

    if (!session.url) {
      //url of the hosted page on stripe
      return res.status(500).json({ message: "Error creating stripe session" });
    }

    await newOrder.save();
    res.json({ url: session.url });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ message: error.raw.message });
  }
};

const createLineItems = (
  checkoutSessionRequest: CheckoutSessionRequest,
  menuItems: MenuItemType[]
) => {
  //1.for each cartitem, get the menuItem object from the restaurant -> to get the price
  //2.for each cartItem, convert it to a stripe line item
  //3.return a line item array

  const lineItems = checkoutSessionRequest.cartItems.map((cartItem) => {
    const menuItem = menuItems.find(
      (item) => item._id.toString() === cartItem.menuItemId.toString()
    ); //returns the object if its found

    if (!menuItem) {
      throw new Error(`Menu Item not found: ${cartItem.menuItemId}`);
    }

    const line_item: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: "usd",
        unit_amount: menuItem.price,
        product_data: {
          name: menuItem.name,
        },
      },
      quantity: parseInt(cartItem.quantity),
    };
    return line_item;
  });

  return lineItems;
};

const createSession = async (
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[],
  orderId: string,
  deliveryPrice: number,
  restaurantId: string
) => {
  const sessionData = await STRIPE.checkout.sessions.create({
    line_items: lineItems,
    shipping_options: [
      {
        shipping_rate_data: {
          display_name: "Standard delivery",
          type: "fixed_amount",
          fixed_amount: {
            amount: deliveryPrice,
            currency: "usd",
          },
        },
      },
    ],
    mode: "payment",
    success_url: `${FRONTEND_URL}/order-status?success=true`,
    cancel_url: `${FRONTEND_URL}/detail/${restaurantId}cancelled=true`,
    metadata: {
      orderId,
      restaurantId,
    },
  });

  return sessionData;
};

export default {
  createCheckoutSession,
  stripeWebhookHandler,
  getMyOrders
};

import { Request, Response } from "express";
import Restaurant from "../models/Restaurant";
import cloudinary, { UploadStream } from "cloudinary";
import mongoose from "mongoose";
import Order from "../models/Order";

const getMyRestaurant = async (req: Request, res: Response) => {
  try {
    const restaurant = await Restaurant.findOne({ user: req.userId });

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    res.json(restaurant);
  } catch (err) {
    console.log("error", err);
    res.status(500).json({ message: "Error fetching Resaurant" });
  }
};

const createMyRestaurant = async (req: Request, res: Response) => {
  try {
    const existingRestaurant = await Restaurant.findOne({
      user: req.userId,
    });

    if (existingRestaurant) {
      return res.status(409).json({
        message: "User already has a restaurant",
      });
    }

    //getting the image from the request body
    //const image = req.file as Express.Multer.File

    //convert image to base64 string
    //const base64Image = Buffer.from(image.buffer).toString("base64");
    //const dataURI = `data:${image.mimetype};base64,${base64Image}` //mimetype is type of image. eg jpeg. png

    //upload image to cloudinary
    //const uploadResponse = await cloudinary.v2.uploader.upload(dataURI)

    const imageUrl = await uploadImage(req.file as Express.Multer.File);

    const newRestaurant = new Restaurant(req.body);
    newRestaurant.imageUrl = imageUrl;
    newRestaurant.user = new mongoose.Types.ObjectId(req.userId); //linking the current logged in user to this restaurant record
    newRestaurant.lastUpdated = new Date();
    await newRestaurant.save();

    res.status(201).send(newRestaurant);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const updateMyRestaurant = async (req: Request, res: Response) => {
  try {
    const updatedRestaurant = await Restaurant.findOne({
      user: req.userId,
    });

    if (!updatedRestaurant) {
      return res.status(404).json({ message: "Restaurant Not Found" });
    }

    //Now update the field from the request.body
    updatedRestaurant.restaurantName = req.body.restaurantName;
    updatedRestaurant.city = req.body.city;
    updatedRestaurant.country = req.body.country;
    updatedRestaurant.deliveryPrice = req.body.deliveryPrice;
    updatedRestaurant.estimatedDeliveryTime = req.body.estimatedDeliveryTime;
    updatedRestaurant.cuisines = req.body.cuisines;
    updatedRestaurant.menuItems = req.body.menuItems;
    updatedRestaurant.lastUpdated = new Date();

    //for the image
    if (req.file) {
      const imageUrl = await uploadImage(req.file as Express.Multer.File);
      updatedRestaurant.imageUrl = imageUrl;
    }

    await updatedRestaurant.save();
    res.status(200).send(updatedRestaurant);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const getMyRestaurantOrders = async (req: Request, res: Response) => {
  try {
    const restaurant = await Restaurant.findOne({ user: req.userId }); //use the userId to find the owner of the restaurant
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant Not Found" });
    }

    //use the id to get the orders for the restaurant
    const orders = await Order.find({ restaurant: restaurant._id })
      .populate("restaurant")
      .populate("user");

    return res.json(orders);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order Not Found" });
    }

    const restaurant = await Restaurant.findById(order.restaurant);

    if (restaurant?.user?._id.toString() !== req.userId) {
      return res.status(401).send();
    }

    order.status = status;
    await order.save();
    res.status(200).json(order);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Unable to update order status" });
  }
};

const uploadImage = async (file: Express.Multer.File) => {
  //getting the image from the request body
  const image = file;

  //convert image to base64 string
  const base64Image = Buffer.from(image.buffer).toString("base64");
  const dataURI = `data:${image.mimetype};base64,${base64Image}`; //mimetype is type of image. eg jpeg. png

  //upload image to cloudinary
  const uploadResponse = await cloudinary.v2.uploader.upload(dataURI);
  return uploadResponse.url;
};

export default {
  createMyRestaurant,
  getMyRestaurant,
  updateMyRestaurant,
  getMyRestaurantOrders,
  updateOrderStatus,
};

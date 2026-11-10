import Root from "../../app/_layout";
import Welcome from "../../app/index";
import ClientLayout from "../../app/client/_layout";
import Client from "../../app/client/index";
import Categories from "../../app/client/categories";
import Search from "../../app/client/search";
import Requests from "../../app/client/requests";
import ClientProfile from "../../app/client/profile";
import ProviderLayout from "../../app/provider/_layout";
import Provider from "../../app/provider/index";
import Received from "../../app/provider/requests";
import Services from "../../app/provider/services";
import ProviderProfile from "../../app/provider/profile";
import Detail from "../../app/professional/[id]";
import NotFound from "../../app/+not-found";
import Login from "../../app/login";
import Register from "../../app/register";
import Account from "../../app/account";
export const routes = {
  _layout: Root,
  index: Welcome,
  "client/_layout": ClientLayout,
  "client/index": Client,
  "client/categories": Categories,
  "client/search": Search,
  "client/requests": Requests,
  "client/profile": ClientProfile,
  "provider/_layout": ProviderLayout,
  "provider/index": Provider,
  "provider/requests": Received,
  "provider/services": Services,
  "provider/profile": ProviderProfile,
  "professional/[id]": Detail,
  "+not-found": NotFound,
  login: Login,
  register: Register,
  account: Account,
};

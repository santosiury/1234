import Root from "../../app/_layout";
import Welcome from "../../app/index";
import ClientLayout from "../../app/client/_layout";
import Client from "../../app/client/index";
import Categories from "../../app/client/categories";
import Search from "../../app/client/search";
import Requests from "../../app/client/requests/index";
import ClientProfile from "../../app/client/profile";
import * as ProviderLayout from "../../app/provider/_layout";
import Provider from "../../app/provider/index";
import ProfessionalAccount from "../../app/provider/account";
import Received from "../../app/provider/requests/index";
import Services from "../../app/provider/services/index";
import ProviderProfile from "../../app/provider/profile/index";
import Detail from "../../app/professional/[id]";
import NotFound from "../../app/+not-found";
import Login from "../../app/login";
import Register from "../../app/register";
import Account from "../../app/account";
import ProviderSetup from "../../app/provider-setup/_layout";
import ServiceForm from "../../app/provider-setup/service";
import ProfileForm from "../../app/provider-setup/profile";
import Areas from "../../app/provider-setup/areas";
import AreaForm from "../../app/provider-setup/area";
import * as ServicesLayout from "../../app/provider/services/_layout";
import * as ProfileLayout from "../../app/provider/profile/_layout";
import * as AreasLayout from "../../app/provider/areas/_layout";
import CanonicalServiceForm from "../../app/provider/services/edit";
import CanonicalProfileForm from "../../app/provider/profile/edit";
import CanonicalAreas from "../../app/provider/areas/index";
import CanonicalAreaForm from "../../app/provider/areas/edit";
import * as SentLayout from "../../app/client/requests/_layout";
import * as ReceivedLayout from "../../app/provider/requests/_layout";
import SentDetail from "../../app/client/requests/[id]";
import ReceivedDetail from "../../app/provider/requests/[id]";
import NewRequest from "../../app/service-request/new";
import ResumeRequest from "../../app/service-request/resume";
export const routes = {
  _layout: Root,
  index: Welcome,
  "client/_layout": ClientLayout,
  "client/index": Client,
  "client/categories": Categories,
  "client/search": Search,
  "client/requests/_layout": SentLayout,
  "client/requests/index": Requests,
  "client/requests/[id]": SentDetail,
  "client/profile": ClientProfile,
  "provider/_layout": ProviderLayout,
  "provider/index": Provider,
  "provider/requests/_layout": ReceivedLayout,
  "provider/requests/index": Received,
  "provider/requests/[id]": ReceivedDetail,
  "service-request/new": NewRequest,
  "service-request/resume": ResumeRequest,
  "provider/account": ProfessionalAccount,
  "provider/services/_layout": ServicesLayout,
  "provider/services/index": Services,
  "provider/services/edit": CanonicalServiceForm,
  "provider/profile/_layout": ProfileLayout,
  "provider/profile/index": ProviderProfile,
  "provider/profile/edit": CanonicalProfileForm,
  "provider/areas/_layout": AreasLayout,
  "provider/areas/index": CanonicalAreas,
  "provider/areas/edit": CanonicalAreaForm,
  "professional/[id]": Detail,
  "+not-found": NotFound,
  login: Login,
  register: Register,
  account: Account,
  "provider-setup/_layout": ProviderSetup,
  "provider-setup/service": ServiceForm,
  "provider-setup/profile": ProfileForm,
  "provider-setup/areas": Areas,
  "provider-setup/area": AreaForm,
};

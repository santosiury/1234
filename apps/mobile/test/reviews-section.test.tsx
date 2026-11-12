import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  ReviewsSection,
  type ReviewsViewState,
} from "../src/components/ReviewsSection";

test("unavailable and empty reviews never display a placeholder score, count, stars or comments", async () => {
  const view = await render(<ReviewsSection />);
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
  expect(screen.queryByText(/de 5|avaliações recebidas|★|☆/)).toBeNull();
  await view.rerender(<ReviewsSection state={{ status: "empty" }} />);
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
});

test("review presentation supports loading and safe error/retry without falling back to an empty score", async () => {
  const retry = jest.fn();
  const view = await render(<ReviewsSection state={{ status: "loading" }} />);
  expect(screen.getByLabelText("Carregando avaliações")).toBeTruthy();
  expect(screen.queryByText("Ainda não há avaliações.")).toBeNull();
  await view.rerender(
    <ReviewsSection state={{ status: "error", onRetry: retry }} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Não foi possível carregar as avaliações.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});

test("future supplied summaries are presented without calculation and given reviews remain owner-only", async () => {
  // Component contract fixture only: no production caller supplies review data in this phase.
  const supplied: ReviewsViewState = {
    status: "ready",
    average: 4.5,
    count: 12,
    received: [
      {
        id: "received",
        authorLabel: "Cliente",
        rating: 4,
        comment: "Comentário publicado.",
      },
    ],
    given: [
      {
        id: "given",
        authorLabel: "Cliente avaliado",
        rating: 5,
        comment: "Comentário do prestador.",
      },
    ],
  };
  const view = await render(<ReviewsSection state={supplied} />);
  expect(screen.getByText("4,5 de 5 · 12 avaliações recebidas")).toBeTruthy();
  expect(screen.getByText("Comentário publicado.")).toBeTruthy();
  expect(screen.getByText("Avaliações que você fez")).toBeTruthy();
  expect(screen.getByText("Comentário do prestador.")).toBeTruthy();
  await view.rerender(<ReviewsSection audience="public" state={supplied} />);
  expect(screen.getByText("Comentário publicado.")).toBeTruthy();
  expect(screen.queryByText("Comentário do prestador.")).toBeNull();
  expect(screen.queryByText("Avaliações que você fez")).toBeNull();
});

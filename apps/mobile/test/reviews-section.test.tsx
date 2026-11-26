import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  ReviewsSection,
  type ReviewsViewState,
} from "../src/components/ReviewsSection";

test("unavailable and empty reviews never display a placeholder score, count, stars or comments", async () => {
  const view = await render(<ReviewsSection />);
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
  expect(screen.queryByText(/de 5|avaliações recebidas|★|☆|⭐/)).toBeNull();
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

test("supplied real summaries are presented without calculation and given reviews remain owner-only", async () => {
  // Presentation fixture; real callers keep totals/averages supplied by the API.
  const supplied: ReviewsViewState = {
    status: "ready",
    average: 4.5,
    count: 12,
    received: [
      {
        id: "received",
        authorLabel: "Cliente Omini",
        rating: 4,
        comment: "Comentário publicado.",
        createdAt: "2026-11-20T12:00:00.000Z",
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
  expect(screen.getByText("4,5 ⭐ · 12 avaliações recebidas")).toBeTruthy();
  expect(screen.getByText("Cliente Omini · 4 ⭐")).toBeTruthy();
  expect(
    screen.getByText(
      new Date("2026-11-20T12:00:00.000Z").toLocaleDateString("pt-BR"),
    ),
  ).toBeTruthy();
  expect(screen.getByText("Comentário publicado.")).toBeTruthy();
  expect(screen.getByText("Avaliações que você fez")).toBeTruthy();
  expect(screen.getByText("Comentário do prestador.")).toBeTruthy();
  await view.rerender(<ReviewsSection audience="public" state={supplied} />);
  expect(screen.getByText("Comentário publicado.")).toBeTruthy();
  expect(screen.queryByText("Comentário do prestador.")).toBeNull();
  expect(screen.queryByText("Avaliações que você fez")).toBeNull();
});

test.each([1, 2, 3, 4, 5] as const)(
  "rating %s stays dynamic and one review uses the singular label",
  async (rating) => {
    await render(
      <ReviewsSection
        state={{
          status: "ready",
          average: rating,
          count: 1,
          received: [{ id: "one", authorLabel: "Cliente Omini", rating }],
        }}
      />,
    );
    expect(
      screen.getByText(`${rating} ⭐ · 1 avaliação recebida`),
    ).toBeTruthy();
    expect(screen.getByText(`Cliente Omini · ${rating} ⭐`)).toBeTruthy();
    expect(screen.queryByText(/de 5/)).toBeNull();
  },
);

test("zero reviews never display a score even if the supplied ready state contains one", async () => {
  await render(
    <ReviewsSection
      state={{ status: "ready", average: 5, count: 0, received: [] }}
    />,
  );
  expect(screen.getByText("Ainda não há avaliações.")).toBeTruthy();
  expect(screen.queryByText(/⭐|avaliações recebidas/)).toBeNull();
});

test("a backend average of 3.5 and a total beyond the current comment page are preserved", async () => {
  await render(
    <ReviewsSection
      state={{
        status: "ready",
        average: 3.5,
        count: 8,
        received: [
          {
            id: "page-one",
            authorLabel: "Cliente Omini",
            rating: 4,
            comment: "Comentário preservado.",
            createdAt: "2026-11-20T12:00:00Z",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("3,5 ⭐ · 8 avaliações recebidas")).toBeTruthy();
  expect(screen.getByText("Cliente Omini · 4 ⭐")).toBeTruthy();
  expect(screen.getByText("Comentário preservado.")).toBeTruthy();
});

test("protected reputation never reveals whether a small sample is empty or contains reviews", async () => {
  await render(
    <ReviewsSection
      title="Reputação do cliente"
      state={{ status: "protected" }}
    />,
  );
  expect(screen.getByText("Reputação protegida")).toBeTruthy();
  expect(screen.queryByText("Ainda não há avaliações.")).toBeNull();
  expect(
    screen.queryByText(/⭐|\d+ avaliações recebidas|Cliente Omini/),
  ).toBeNull();
});
test("anonymous aggregates render the backend distribution and suppress individual metadata even if supplied", async () => {
  await render(
    <ReviewsSection
      state={{
        status: "ready",
        average: 3.8,
        count: 5,
        anonymous: true,
        distribution: [
          { stars: 5, count: 2 },
          { stars: 4, count: 1 },
          { stars: 3, count: 1 },
          { stars: 2, count: 1 },
          { stars: 1, count: 0 },
        ],
        received: [
          {
            id: "private",
            authorLabel: "Nome privado",
            rating: 1,
            comment: "Não divulgar",
            createdAt: "2026-12-01T12:00:00Z",
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("3,8 ⭐ · 5 avaliações recebidas")).toBeTruthy();
  expect(screen.getAllByRole("progressbar")).toHaveLength(5);
  expect(
    screen.getByRole("progressbar", { name: "5 estrelas" }),
  ).toHaveAccessibilityValue({
    min: 0,
    max: 5,
    now: 2,
    text: "2 avaliações de 5",
  });
  expect(screen.queryByText(/Nome privado|Não divulgar/)).toBeNull();
});
test("reputation texts allow system font scaling and wrap, while bars keep accessible exact counts", async () => {
  await render(
    <ReviewsSection
      state={{
        status: "ready",
        average: 4.5,
        count: 10000,
        anonymous: true,
        received: [],
        distribution: [
          { stars: 5, count: 5000 },
          { stars: 4, count: 5000 },
          { stars: 3, count: 0 },
          { stars: 2, count: 0 },
          { stars: 1, count: 0 },
        ],
      }}
    />,
  );
  const text = screen.getByText("4,5 ⭐ · 10000 avaliações recebidas");
  expect(text.props.numberOfLines).toBeUndefined();
  expect(text.props.allowFontScaling).not.toBe(false);
  expect(
    screen.getByRole("progressbar", { name: "4 estrelas" }),
  ).toHaveAccessibilityValue({ now: 5000, max: 10000 });
});
